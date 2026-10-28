-- Migration: 005_appeals_indexes
-- Lookups added for the appeals workflow: find by submission, list open queue.

CREATE INDEX idx_appeals_submission_id ON appeals(submission_id);
CREATE INDEX idx_appeals_status ON appeals(status);
