/**
 * Job funding quote: what goes into escrow, Zeno's fee, and what the buyer pays.
 *
 * The escrow holds only contributor payouts (the job budget). Zeno's fee is a
 * share of what the buyer pays (`ZENO_FEE_BPS`, default 20%), so for a
 * payout P the fee F satisfies F / (P + F) = bps / 10000, i.e.
 * F = P * bps / (10000 - bps). With the PRD pricing, a 0.04 USDC reward makes
 * a 0.05 USDC buyer price (0.01 fee = 20% of 0.05).
 *
 * All arithmetic is in USDC base units (bigint); the fee rounds up to the next
 * base unit so the platform never undercharges by rounding.
 */

import { fromTokenUnits, toTokenUnits } from "@/lib/settlement/network";

export interface FundingQuote {
  /** Escrow budget = contributor payouts, decimal USDC. */
  payout: string;
  /** Zeno fee, decimal USDC. */
  fee: string;
  /** What the buyer pays, decimal USDC. */
  total: string;
  fee_bps: number;
  /** Escrow budget in USDC base units (what `fundJob` deposits). */
  payout_units: string;
  /** Card/UPI charge in US cents (1 USDC = 1 USD), rounded up. */
  total_cents: number;
}

const BPS = BigInt(10_000);
const ONE = BigInt(1);
const ZERO = BigInt(0);
/** USDC base units per US cent (1 USD = 100 cents = 1_000_000 units). */
const UNITS_PER_CENT = BigInt(10_000);

function ceilDiv(a: bigint, b: bigint): bigint {
  return a === ZERO ? ZERO : (a - ONE) / b + ONE;
}

export function quoteFunding(budget: string, feeBps: number): FundingQuote {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps >= 10_000) {
    throw new Error(`Invalid fee bps: ${feeBps}`);
  }
  const payout = toTokenUnits(budget);
  if (payout <= ZERO) throw new Error("Budget must be positive");
  const bps = BigInt(feeBps);
  const fee = ceilDiv(payout * bps, BPS - bps);
  const total = payout + fee;
  const totalCents = ceilDiv(total, UNITS_PER_CENT);
  return {
    payout: fromTokenUnits(payout),
    fee: fromTokenUnits(fee),
    total: fromTokenUnits(total),
    fee_bps: feeBps,
    payout_units: payout.toString(),
    total_cents: Number(totalCents),
  };
}
