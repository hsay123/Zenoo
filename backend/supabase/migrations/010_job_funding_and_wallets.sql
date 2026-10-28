-- Migration: 010_job_funding_and_wallets
-- Adds job funding tracking and wallet verification for companies/contributors
-- Idempotent: safe to run on fresh or existing databases.

-- ============================================================
-- 1. Add funding fields to jobs
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'funded_amount'
  ) THEN
    ALTER TABLE jobs ADD COLUMN funded_amount NUMERIC(18,6) NOT NULL DEFAULT '0';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'funding_tx_hash'
  ) THEN
    ALTER TABLE jobs ADD COLUMN funding_tx_hash TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'funding_status'
  ) THEN
    ALTER TABLE jobs ADD COLUMN funding_status TEXT NOT NULL DEFAULT 'unfunded'
      CHECK (funding_status IN ('unfunded', 'pending', 'funded', 'failed'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'funding_wallet_address'
  ) THEN
    ALTER TABLE jobs ADD COLUMN funding_wallet_address TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'funded_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN funded_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index for querying funded jobs
CREATE INDEX IF NOT EXISTS idx_jobs_funding_status ON jobs(funding_status);

-- ============================================================
-- 2. Add wallet verification fields to users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'wallet_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN wallet_verified BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'wallet_verification_tx_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN wallet_verification_tx_hash TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'wallet_verified_at'
  ) THEN
    ALTER TABLE users ADD COLUMN wallet_verified_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================
-- 3. Add is_demo flag to jobs and tasks to filter seed data
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE jobs ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE tasks ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Index for filtering demo jobs
CREATE INDEX IF NOT EXISTS idx_jobs_is_demo ON jobs(is_demo);
CREATE INDEX IF NOT EXISTS idx_tasks_is_demo ON tasks(is_demo);

-- ============================================================
-- 4. Add funding_tx_hash to settlements for tracking
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settlements' AND column_name = 'funding_tx_hash'
  ) THEN
    ALTER TABLE settlements ADD COLUMN funding_tx_hash TEXT;
  END IF;
END $$;

-- ============================================================
-- 5. Update seed data to mark as demo
-- ============================================================
UPDATE jobs SET is_demo = TRUE WHERE id IN (
  '5eed0000-0000-4000-8000-000000000030',
  '5eed0000-0000-4000-8000-000000000031'
);

UPDATE tasks SET is_demo = TRUE WHERE id IN (
  '5eed0000-0000-4000-8000-000000000040',
  '5eed0000-0000-4000-8000-000000000041',
  '5eed0000-0000-4000-8000-000000000042',
  '5eed0000-0000-4000-8000-000000000050',
  '5eed0000-0000-4000-8000-000000000051',
  '5eed0000-0000-4000-8000-000000000052'
);