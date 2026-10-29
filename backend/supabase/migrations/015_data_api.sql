-- Migration: 015_data_api
-- Startup Data API (docs/system/DATA-API.md): API keys, monthly usage, and the
-- organisation's API plan (the $299/month Dodo subscription, test mode).
--
-- Additive and idempotent: safe to run on fresh or existing databases.

-- ── API keys ──────────────────────────────────────────────────────────────
-- Only a SHA-256 hash of each key is stored; the key itself is shown once.
CREATE TABLE IF NOT EXISTS api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  prefix           TEXT NOT NULL,                 -- first characters, for display
  key_hash         TEXT NOT NULL UNIQUE,          -- sha256 hex of the full key
  scopes           TEXT[] NOT NULL DEFAULT ARRAY['datasets:read', 'labels:read', 'media:read'],
  last_used_at     TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- ── Monthly usage per organisation ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_usage (
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month            DATE NOT NULL,                 -- first day of the month (UTC)
  requests         BIGINT NOT NULL DEFAULT 0,
  records          BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, month)
);
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Atomic counter bump (one call per API request).
CREATE OR REPLACE FUNCTION record_api_usage(p_org uuid, p_records bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  INSERT INTO api_usage (organization_id, month, requests, records)
  VALUES (p_org, date_trunc('month', now() AT TIME ZONE 'utc')::date, 1, GREATEST(p_records, 0))
  ON CONFLICT (organization_id, month)
  DO UPDATE SET requests = api_usage.requests + 1,
                records  = api_usage.records + GREATEST(EXCLUDED.records, 0);
$$;
REVOKE ALL ON FUNCTION record_api_usage(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_api_usage(uuid, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION record_api_usage(uuid, bigint) TO service_role;

-- ── The organisation's API plan ───────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS api_plan                  TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS api_plan_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS api_plan_status           TEXT,
  ADD COLUMN IF NOT EXISTS api_plan_renews_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_plan_updated_at       TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_api_plan_check') THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_api_plan_check
      CHECK (api_plan IN ('none', 'api'));
  END IF;
END $$;

-- Keyset pagination over a job's accepted labels: (job, status, updated_at, id).
CREATE INDEX IF NOT EXISTS idx_tasks_job_status_updated
  ON tasks(job_id, status, updated_at, id);

-- Same posture as every table: no anon/authenticated privileges.
REVOKE ALL ON api_keys, api_usage FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
