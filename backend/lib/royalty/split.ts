/**
 * ROADMAP DEMO (HHG F5) — royalty split for a simulated data-API sale.
 *
 * Mirrors `RoyaltySplitter.quote` exactly (bigint, basis points): data owner
 * and contributors' shares round down, each contributor gets
 * floor(contributorsShare * weight / totalWeight), and Zeno takes its share
 * plus all rounding dust, so the parts always sum to the sale amount.
 */

export const DEFAULT_SPLIT_BPS = { zeno: 5_000, dataOwner: 3_000, contributors: 2_000 } as const;
const BPS = BigInt(10_000);

export interface SplitQuote {
  zeno: bigint;
  dataOwner: bigint;
  contributors: bigint;
  perContributor: bigint[];
}

export function quoteSplit(
  amount: bigint,
  weights: readonly bigint[],
  bps: { dataOwner: number; contributors: number } = DEFAULT_SPLIT_BPS,
): SplitQuote {
  if (amount <= BigInt(0)) throw new Error("Amount must be positive");
  if (weights.length === 0) throw new Error("At least one contributor is required");
  if (weights.some((w) => w <= BigInt(0))) throw new Error("Weights must be positive");

  const dataOwner = (amount * BigInt(bps.dataOwner)) / BPS;
  const contributorsPool = (amount * BigInt(bps.contributors)) / BPS;
  const totalWeight = weights.reduce((a, b) => a + b, BigInt(0));
  const perContributor = weights.map((w) => (contributorsPool * w) / totalWeight);
  const contributors = perContributor.reduce((a, b) => a + b, BigInt(0));
  return { zeno: amount - dataOwner - contributors, dataOwner, contributors, perContributor };
}

export interface LabelRow {
  contributor_id: string;
  wallet_address: string | null;
}

/**
 * Turn one row per accepted label into split recipients weighted by accepted
 * labels. Contributors without a payout wallet are left out (and counted), and
 * the list is capped at the contract's 100-recipient limit, heaviest first.
 */
export function contributorWeights(
  rows: readonly LabelRow[],
  max = 100,
): { recipients: { wallet: string; weight: bigint }[]; skippedWithoutWallet: number } {
  const byWallet = new Map<string, bigint>();
  const skipped = new Set<string>();
  for (const row of rows) {
    const wallet = (row.wallet_address ?? "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      skipped.add(row.contributor_id);
      continue;
    }
    const key = wallet.toLowerCase();
    byWallet.set(key, (byWallet.get(key) ?? BigInt(0)) + BigInt(1));
  }
  const recipients = Array.from(byWallet, ([wallet, weight]) => ({ wallet, weight }))
    .sort((a, b) => (b.weight === a.weight ? a.wallet.localeCompare(b.wallet) : b.weight > a.weight ? 1 : -1))
    .slice(0, max);
  return { recipients, skippedWithoutWallet: skipped.size };
}
