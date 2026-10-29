/**
 * Settlement network and token units.
 *
 * One chain at a time, chosen by env (`CHAIN_ID`, `RPC_URL`). Money crosses the
 * chain boundary only through `toTokenUnits` / `fromTokenUnits`, which use the
 * token's 6 decimals (USDC) — never `parseEther`, never `Number()`.
 */

import { formatUnits, parseUnits, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { Env } from "@/lib/env";

export const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id; // 84532
export const BASE_CHAIN_ID = base.id; // 8453

/**
 * Chains settlement and funding may run on. Base mainnet is deliberately
 * absent: no real funds move until the audit items are closed and keys are
 * rotated (docs/AUDIT-2026-10.md). Adding 8453 here is a reviewed decision.
 */
export const SETTLEMENT_ALLOWED_CHAIN_IDS: readonly number[] = [BASE_SEPOLIA_CHAIN_ID];

const KNOWN_CHAINS: Record<number, Chain> = {
  [BASE_SEPOLIA_CHAIN_ID]: baseSepolia,
  [BASE_CHAIN_ID]: base,
};

/** USDC (and the escrow's accounting) uses 6 decimals. */
export const TOKEN_DECIMALS = 6;

/** The viem chain for a chain id, or null when it is not a known Base chain. */
export function chainForId(chainId: number): Chain | null {
  return KNOWN_CHAINS[chainId] ?? null;
}

/** True when settlement/funding is allowed on this chain id. */
export function isAllowedChain(chainId: number): boolean {
  return SETTLEMENT_ALLOWED_CHAIN_IDS.includes(chainId);
}

/** `RPC_URL`, falling back to the deprecated `MONAD_RPC_URL` alias. */
export function resolveRpcUrl(env: Pick<Env, "RPC_URL" | "MONAD_RPC_URL">): string {
  return (env.RPC_URL ?? env.MONAD_RPC_URL ?? "").trim();
}

/** Decimal amount strings the platform stores: `NUMERIC(18,6)`, non-negative. */
const DECIMAL_AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

/**
 * Convert an API/DB decimal string (e.g. `"0.04"`) to token base units
 * (`40000n`). Throws on anything that is not a plain decimal with at most 6
 * places — exponent notation, signs, extra precision and non-strings included.
 */
export function toTokenUnits(amount: string): bigint {
  if (typeof amount !== "string" || !DECIMAL_AMOUNT_RE.test(amount.trim())) {
    throw new Error(`Not a valid token amount (max ${TOKEN_DECIMALS} decimals): ${amount}`);
  }
  return parseUnits(amount.trim(), TOKEN_DECIMALS);
}

/** Token base units back to a decimal string (`40000n` → `"0.04"`). */
export function fromTokenUnits(units: bigint): string {
  return formatUnits(units, TOKEN_DECIMALS);
}
