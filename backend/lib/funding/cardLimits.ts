/**
 * When card/UPI funding may be offered for a job (HHG F2).
 *
 * A card payment is only worth taking if Zeno can turn it into escrow
 * funding: Dodo refuses charges under the product's minimum, and the treasury
 * must hold the job's USDC budget plus a little gas. Checked when the screen
 * asks (GET /funding) and again before a checkout is created, so a buyer is
 * never charged for a job the platform cannot fund.
 */

export const CARD_MIN_TOTAL_CENTS = 50; // the Dodo product's $0.50 minimum
/** Approve + fundJob on Base Sepolia cost far less; this leaves headroom. */
export const TREASURY_MIN_GAS_WEI = BigInt("20000000000000"); // 0.00002 ETH

export type CardAvailability = { available: true; reason: null } | { available: false; reason: string };

export function cardAvailability(input: {
  configured: boolean;
  totalCents: number;
  payoutUnits: bigint;
  /** null: no treasury, or its balance could not be read. */
  capacity: { usdcUnits: bigint; gasWei: bigint } | null;
  treasuryConfigured: boolean;
}): CardAvailability {
  if (!input.configured) return { available: false, reason: "Card/UPI payments are not enabled" };
  if (input.totalCents < CARD_MIN_TOTAL_CENTS) {
    const dollars = (input.totalCents / 100).toFixed(2);
    return {
      available: false,
      reason: `Card payments start at $0.50; this job costs $${dollars}. Raise the budget or fund from a wallet.`,
    };
  }
  if (input.treasuryConfigured) {
    if (!input.capacity) {
      return { available: false, reason: "Card funding is temporarily unavailable (treasury unreachable). Try again shortly." };
    }
    if (input.capacity.usdcUnits < input.payoutUnits) {
      return {
        available: false,
        reason:
          "Card funding for this amount is not available right now: the platform's test-USDC float is lower than this job's budget. Fund from a wallet, or lower the budget.",
      };
    }
    if (input.capacity.gasWei < TREASURY_MIN_GAS_WEI) {
      return { available: false, reason: "Card funding is temporarily unavailable (treasury gas is low)." };
    }
  }
  return { available: true, reason: null };
}
