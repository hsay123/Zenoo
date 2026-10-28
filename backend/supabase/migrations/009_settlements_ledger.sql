-- Migration: 009_settlements_ledger
-- Makes settlement crash-safe and idempotent.
--
-- The previous flow called the chain first and only then wrote the receipt, so a
-- transaction that succeeded but whose response was lost left the task
-- un-settled with no record of the on-chain payout. This table records the
-- settlement *before* the chain call, stores the transaction hash as soon as it
-- is broadcast, and is finalised afterwards. `task_id` is UNIQUE, so a task can
-- have at most one settlement row (and therefore at most one on-chain payout).
--
-- Additive and idempotent: safe to run on fresh or existing databases.

CREATE TABLE IF NOT EXISTS settlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  submission_id    UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  contributor_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  tx_hash          TEXT,
  is_mock          BOOLEAN,
  amount           NUMERIC(18,6) NOT NULL,
  annotation_hash  TEXT NOT NULL,
  policy_hash      TEXT,
  review_ref       UUID REFERENCES reviews(id),
  receipt_id       UUID REFERENCES receipts(id),
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settlements FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_job_id ON settlements(job_id);

DROP TRIGGER IF EXISTS set_updated_at ON settlements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
