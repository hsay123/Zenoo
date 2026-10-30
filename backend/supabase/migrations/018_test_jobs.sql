-- Migration: 018_test_jobs
-- Keep automated-test artifacts out of the production contributor queue.
--
-- The e2e suite shares this database with the live demo, so every run used to
-- leave real, fundable jobs behind ("E2E S9 …", "Acme E2E …", "Other Co …").
-- Contributors saw those instead of the jobs real companies created.
--
-- `is_test` is separate from `is_demo` on purpose:
--   * is_demo  = preview data; it must never move escrow funds.
--   * is_test  = an automated-test fixture. It may settle normally (the e2e
--                settlement spec needs that) but production hides it from the
--                contributor queue.
-- Additive and idempotent.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill artifacts created before the flag existed, by the E2E organisations
-- the suite onboards into. Real customer organisations are untouched.
UPDATE jobs j
SET is_test = TRUE
FROM projects p
JOIN users u ON u.id = p.buyer_id
LEFT JOIN organizations o ON o.id = u.organization_id
WHERE p.id = j.project_id
  AND (
    o.name IN ('E2E Robotics Co', 'Organization''s Organization', 'Empty Wallet Co')
    OR o.name LIKE 'Acme E2E %'
    OR o.name LIKE 'Other Co %'
    OR o.name LIKE 'Email Co %'
  );

UPDATE tasks t
SET is_test = TRUE
FROM jobs j
WHERE t.job_id = j.id
  AND j.is_test
  AND NOT t.is_test;

CREATE INDEX IF NOT EXISTS idx_jobs_is_test ON jobs (is_test);
CREATE INDEX IF NOT EXISTS idx_tasks_is_test ON tasks (is_test);

NOTIFY pgrst, 'reload schema';
