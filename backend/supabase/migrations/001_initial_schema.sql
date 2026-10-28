-- Migration: 001_initial_schema
-- Creates all core tables for PhysicalData Network backend.
-- RLS is enabled on every table with NO policies, so the anon key
-- can read nothing. The service role key (server-side only) bypasses RLS.

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- optional: text search

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role   AS ENUM ('buyer','contributor','reviewer','admin');
CREATE TYPE user_status AS ENUM ('active','suspended');
CREATE TYPE modality    AS ENUM ('image','video');
CREATE TYPE job_status  AS ENUM ('draft','published','paused','closed');
CREATE TYPE task_status AS ENUM (
  'available','claimed','draft','submitted',
  'needs_revision','accepted','rejected','appealed','paid'
);
CREATE TYPE reviewer_type AS ENUM ('code','ai','human');
CREATE TYPE review_decision AS ENUM ('accept','revise','reject');
CREATE TYPE appeal_status AS ENUM ('open','accepted','rejected');

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_did        TEXT UNIQUE,            -- Privy DID (null in DEV bypass)
  wallet_address   TEXT UNIQUE,
  email            TEXT,
  role             user_role NOT NULL DEFAULT 'contributor',
  status           user_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- contributor_profiles
-- ============================================================
CREATE TABLE contributor_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  qualification_passed BOOLEAN NOT NULL DEFAULT FALSE,
  qualification_score  NUMERIC(5,2),
  gold_accuracy        NUMERIC(5,2),            -- rolling %, updated by system
  revision_rate        NUMERIC(5,2),
  tasks_completed      INTEGER NOT NULL DEFAULT 0,
  consent_version      TEXT,
  consented_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE contributor_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- projects
-- ============================================================
CREATE TABLE projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  data_rights      TEXT,                        -- rights declaration text
  retention_policy TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- assets
-- ============================================================
CREATE TABLE assets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_key     TEXT NOT NULL,                -- private storage path
  content_hash   TEXT NOT NULL,               -- sha-256 or keccak of file
  modality       modality NOT NULL,
  duration_ms    INTEGER,                     -- video only
  width          INTEGER,                     -- image only
  height         INTEGER,                     -- image only
  consent_ref    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- schema_versions  (immutable once created)
-- ============================================================
CREATE TABLE schema_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modality     modality NOT NULL,
  schema_name  TEXT NOT NULL,              -- e.g. 'image-boxes-v1'
  json_schema  JSONB NOT NULL,
  label_list   TEXT[] NOT NULL,
  version_hash TEXT UNIQUE NOT NULL,       -- keccak256 of canonical schema
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE schema_versions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- jobs
-- ============================================================
CREATE TABLE jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  schema_version_id   UUID REFERENCES schema_versions(id),
  title               TEXT NOT NULL,
  description         TEXT,
  reward_per_task     NUMERIC(18,6) NOT NULL,  -- in token units (testnet)
  budget              NUMERIC(18,6) NOT NULL,
  deadline            TIMESTAMPTZ,
  policy_hash         TEXT,                    -- keccak256 of rubric JSON
  rubric              JSONB,
  status              job_status NOT NULL DEFAULT 'draft',
  chain_job_id        TEXT,                    -- onchain job ID once funded
  modality            modality NOT NULL,
  label_list          TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_jobs_status      ON jobs(status);
CREATE INDEX idx_jobs_project_id  ON jobs(project_id);

-- ============================================================
-- tasks
-- ============================================================
CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  modality      modality NOT NULL,
  status        task_status NOT NULL DEFAULT 'available',
  is_gold       BOOLEAN NOT NULL DEFAULT FALSE,
  gold_answer   JSONB,                         -- server-only; never returned to contributors
  lease_owner   UUID REFERENCES users(id),
  lease_expiry  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_status      ON tasks(status);
CREATE INDEX idx_tasks_lease_expiry ON tasks(lease_expiry);
CREATE INDEX idx_tasks_job_id      ON tasks(job_id);

-- ============================================================
-- submissions  (append-only – never UPDATE payload)
-- ============================================================
CREATE TABLE submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  contributor_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version         INTEGER NOT NULL DEFAULT 1,
  payload         JSONB NOT NULL,
  payload_hash    TEXT NOT NULL,              -- keccak256 of canonical payload
  schema_version  TEXT NOT NULL,             -- e.g. 'image-boxes-v1'
  is_fast_flag    BOOLEAN NOT NULL DEFAULT FALSE, -- submitted unusually fast
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT UNIQUE                -- from Idempotency-Key header
);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_submissions_task_id        ON submissions(task_id);
CREATE INDEX idx_submissions_contributor_id ON submissions(contributor_id);

-- ============================================================
-- reviews
-- ============================================================
CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_type   reviewer_type NOT NULL,
  reviewer_id     UUID REFERENCES users(id),  -- null for code/ai
  decision        review_decision NOT NULL,
  reason_code     TEXT NOT NULL,
  confidence      NUMERIC(4,3),               -- 0.000 – 1.000; null for code
  rubric_version  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_reviews_submission_id ON reviews(submission_id);

-- ============================================================
-- appeals
-- ============================================================
CREATE TABLE appeals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  contributor_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason           TEXT NOT NULL,
  status           appeal_status NOT NULL DEFAULT 'open',
  adjudicator_id   UUID REFERENCES users(id),
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- receipts
-- ============================================================
CREATE TABLE receipts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    UUID NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
  annotation_hash  TEXT NOT NULL,
  policy_hash      TEXT NOT NULL,
  review_ref       UUID REFERENCES reviews(id),
  tx_hash          TEXT,
  is_mock          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_receipts_submission_id ON receipts(submission_id);

-- ============================================================
-- audit_samples
-- ============================================================
CREATE TABLE audit_samples (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  vrf_request_id  TEXT,
  seed            TEXT,
  selected_task_ids UUID[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_samples ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- idempotency_keys  (for claim/submit/settlement)
-- ============================================================
CREATE TABLE idempotency_keys (
  key          TEXT PRIMARY KEY,
  endpoint     TEXT NOT NULL,
  user_id      UUID REFERENCES users(id),
  response     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Automatically expire idempotency keys after 24 hours (via pg_cron or app-level cleanup)
CREATE INDEX idx_idempotency_keys_created ON idempotency_keys(created_at);
