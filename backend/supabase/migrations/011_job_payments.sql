-- Migration: 011_job_payments
-- HHG F2: buyer funding by card/UPI (Dodo Payments, test mode).
--
-- Additive only: two new tables, no change to existing tables or constraints.
--
-- A fiat payment is recorded here; once it is verified paid, the platform
-- treasury funds the job's escrow in USDC. Until that funding transaction is
-- verified, the job stays `funding_status = 'pending'` and the payment stays
-- `paid` ("paid, awaiting funding") — nothing is shown as funded early.

CREATE TABLE IF NOT EXISTS job_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  buyer_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider            TEXT NOT NULL DEFAULT 'dodo' CHECK (provider IN ('dodo')),
  -- created -> paid -> funding -> funded ; any -> failed
  status              TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created', 'paid', 'funding', 'funded', 'failed')),
  checkout_session_id TEXT UNIQUE,
  provider_payment_id TEXT UNIQUE,
  -- What the buyer is charged, in the provider currency's minor unit (cents).
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  currency            TEXT NOT NULL DEFAULT 'USD',
  -- Escrow budget (contributor payouts) and Zeno fee, in USDC.
  payout_amount       NUMERIC(18,6) NOT NULL CHECK (payout_amount > 0),
  fee_amount          NUMERIC(18,6) NOT NULL CHECK (fee_amount >= 0),
  funding_tx_hash     TEXT,
  error               TEXT,
  paid_at             TIMESTAMPTZ,
  funded_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_payments_job_id_idx ON job_payments (job_id, created_at DESC);

-- Webhook deliveries already processed, keyed by the provider's event id
-- (`webhook-id` header), so a redelivered event is never applied twice.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id           TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  event_type   TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same posture as every other table (migration 006): RLS on, no grants to
-- anon/authenticated; only the backend's service role reads or writes.
ALTER TABLE job_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON job_payments FROM anon, authenticated;
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_webhook_events FROM anon, authenticated;

DROP TRIGGER IF EXISTS set_updated_at ON job_payments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON job_payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

NOTIFY pgrst, 'reload schema';
