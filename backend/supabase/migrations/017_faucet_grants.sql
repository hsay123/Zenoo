-- Migration: 017_faucet_grants
-- Testnet faucet (Base Sepolia only): small grants of test USDC + gas to a
-- buyer's own wallet, so wallet funding works for email sign-ups whose
-- embedded Privy wallet starts empty. Every grant is recorded with its txs.
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS faucet_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address       TEXT NOT NULL,
  usdc_units    BIGINT NOT NULL DEFAULT 0,
  gas_wei       NUMERIC(40,0) NOT NULL DEFAULT 0,
  usdc_tx_hash  TEXT,
  gas_tx_hash   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_faucet_grants_user_time ON faucet_grants(user_id, created_at);
ALTER TABLE faucet_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON faucet_grants FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
