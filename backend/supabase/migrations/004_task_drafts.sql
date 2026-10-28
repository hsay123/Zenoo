-- Migration: 004_task_drafts
-- Draft autosave scratch space for annotations.
--
-- Submissions (001) are append-only; a draft is the latest *mutable*
-- annotation a contributor is still editing for a task. Exactly one row per
-- task, upserted on every autosave.
--
-- RLS is enabled with no policies (service role only), matching the rest of
-- the schema.

CREATE TABLE task_drafts (
  task_id        UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE task_drafts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_task_drafts_contributor_id ON task_drafts(contributor_id);

-- Keep `updated_at` current (function defined in 002).
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON task_drafts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
