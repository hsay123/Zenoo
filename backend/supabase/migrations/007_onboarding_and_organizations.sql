-- Migration: 007_onboarding_and_organizations
-- Adds first-time onboarding tracking and a minimal organization model for buyers.
-- Idempotent: safe to run on fresh or existing databases.

-- ============================================================
-- 1. Track onboarding state on users
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_account_type TEXT CHECK (onboarding_account_type IN ('buyer', 'contributor')),
  ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Index for finding users by organization
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- ============================================================
-- 2. Organizations table (buyer-facing)
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,        -- URL-safe identifier
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- RLS: service role bypasses; no anon/authenticated policies
REVOKE ALL ON organizations FROM anon, authenticated;

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 3. Organization memberships (for future multi-user orgs)
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member' | 'admin'
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organization_members FROM anon, authenticated;

-- ============================================================
-- 4. Foreign key from users to organizations
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_organization_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 5. Backfill: existing users with projects get an org auto-created
-- ============================================================
-- For any user with role='buyer' who owns projects but has no organization,
-- create an organization and link it.
DO $$
DECLARE
  u RECORD;
  org_id UUID;
BEGIN
  FOR u IN
    SELECT DISTINCT p.buyer_id AS user_id
    FROM projects p
    LEFT JOIN users u ON u.id = p.buyer_id
    WHERE u.organization_id IS NULL
  LOOP
    INSERT INTO organizations (name, slug, created_by)
    VALUES (
      COALESCE((SELECT email FROM users WHERE id = u.user_id), 'Organization') || '\'s Organization',
      'org-' || substr(u.user_id::text, 1, 8),
      u.user_id
    )
    RETURNING id INTO org_id;

    UPDATE users SET organization_id = org_id WHERE id = u.user_id;
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (org_id, u.user_id, 'owner')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ============================================================
-- 6. Mark onboarding complete for existing active users
-- ============================================================
-- Users who already have a role other than the default 'contributor'
-- or who own projects are considered to have completed onboarding.
UPDATE users
SET onboarding_completed = TRUE,
    onboarding_account_type = CASE
      WHEN role = 'buyer' THEN 'buyer'
      ELSE 'contributor'
    END
WHERE onboarding_completed = FALSE
  AND (
    role IN ('buyer', 'reviewer', 'admin')
    OR EXISTS (SELECT 1 FROM projects WHERE buyer_id = users.id)
    OR EXISTS (SELECT 1 FROM submissions WHERE contributor_id = users.id)
  );