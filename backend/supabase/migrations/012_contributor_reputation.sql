-- Migration: 012_contributor_reputation
-- HHG F4: contributor reputation score and tiers (New -> Verified -> Trusted -> Reviewer).
--
-- Additive only. The score and tier are computed from existing data (gold
-- results + review outcomes) by lib/reputation/; these columns cache the last
-- computed values for display, plus an admin-settable floor.
--
-- Existing contributors keep every bit of access they have today: each one
-- gets a profile row (if missing) with tier_floor = 'trusted', the tier that
-- can claim every task type. Only accounts created after this migration start
-- at 'new'. An admin can lower a floor later.

ALTER TABLE contributor_profiles
  ADD COLUMN IF NOT EXISTS reputation_score      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tier                  TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS tier_floor            TEXT,
  ADD COLUMN IF NOT EXISTS reputation_updated_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contributor_profiles_tier_check') THEN
    ALTER TABLE contributor_profiles ADD CONSTRAINT contributor_profiles_tier_check
      CHECK (tier IN ('new', 'verified', 'trusted', 'reviewer'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contributor_profiles_tier_floor_check') THEN
    ALTER TABLE contributor_profiles ADD CONSTRAINT contributor_profiles_tier_floor_check
      CHECK (tier_floor IS NULL OR tier_floor IN ('new', 'verified', 'trusted', 'reviewer'));
  END IF;
END $$;

-- Grandfather existing contributors (profile rows were not always created).
INSERT INTO contributor_profiles (user_id, tier_floor)
SELECT u.id, 'trusted'
FROM users u
WHERE u.role = 'contributor'
  AND NOT EXISTS (SELECT 1 FROM contributor_profiles p WHERE p.user_id = u.id);

UPDATE contributor_profiles
SET tier_floor = 'trusted'
WHERE tier_floor IS NULL;

NOTIFY pgrst, 'reload schema';
