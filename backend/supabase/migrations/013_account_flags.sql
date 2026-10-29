-- Migration: 013_account_flags
-- HHG F6.2: duplicate-account / integrity flags (TigerGraph or local graph engine).
--
-- Additive only. A flag never blocks, rejects or moves money by itself: an
-- open flag routes that account's submissions to human review and stops a
-- linked reviewer from deciding the linked contributor's work. An admin
-- confirms or clears each flag.

CREATE TABLE IF NOT EXISTS account_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  related_user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  -- related_user_id as text, or 'self' when there is none (dedupe key).
  pair_key         TEXT NOT NULL,
  -- wallet_link | duplicate_work | self_dealing | linked_review
  signal           TEXT NOT NULL
                     CHECK (signal IN ('wallet_link', 'duplicate_work', 'self_dealing', 'linked_review')),
  evidence         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'cleared')),
  -- 'local' (in-process graph) or 'tigergraph'
  source           TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'tigergraph')),
  resolved_by      UUID REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One flag per (account, signal, related account): re-running a check
-- refreshes evidence instead of duplicating flags, and keeps admin decisions.
CREATE UNIQUE INDEX IF NOT EXISTS account_flags_unique_idx
  ON account_flags (user_id, signal, pair_key);
CREATE INDEX IF NOT EXISTS account_flags_open_idx ON account_flags (user_id) WHERE status = 'open';

ALTER TABLE account_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_flags FROM anon, authenticated;

DROP TRIGGER IF EXISTS set_updated_at ON account_flags;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON account_flags
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

NOTIFY pgrst, 'reload schema';
