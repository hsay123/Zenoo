/**
 * Contributor reputation (HHG F4) — pure scoring and tier rules.
 *
 *   gold accuracy   = gold passes / gold attempts
 *   acceptance rate = accepted / (accepted + rejected + sent back for revision),
 *                     over non-gold tasks with a final outcome
 *   score (0-100)   = 60% gold accuracy + 40% acceptance rate
 *                     (whichever exists alone when only one does; null if neither)
 *
 * Tiers climb New -> Verified -> Trusted -> Reviewer; every threshold comes
 * from config. An admin-set floor (`tier_floor`) lifts the effective tier but
 * never lowers it. The Reviewer tier makes someone *eligible* — promotion to
 * the reviewer role stays a manual admin action.
 */

export const TIERS = ["new", "verified", "trusted", "reviewer"] as const;
export type Tier = (typeof TIERS)[number];

export interface ReputationThresholds {
  verifiedMinGold: number;
  /** Percent, 0-100. */
  verifiedMinGoldAccuracy: number;
  trustedMinAccepted: number;
  trustedMinScore: number;
  reviewerMinAccepted: number;
  reviewerMinScore: number;
}

export const DEFAULT_THRESHOLDS: ReputationThresholds = {
  verifiedMinGold: 5,
  verifiedMinGoldAccuracy: 80,
  trustedMinAccepted: 50,
  trustedMinScore: 85,
  reviewerMinAccepted: 200,
  reviewerMinScore: 92,
};

export interface ReputationStats {
  goldPassed: number;
  goldFailed: number;
  accepted: number;
  rejected: number;
  revised: number;
}

export interface Reputation {
  tier: Tier;
  /** The tier earned from data alone, before any floor. */
  earned_tier: Tier;
  tier_floor: Tier | null;
  score: number | null;
  gold_accuracy: number | null;
  acceptance_rate: number | null;
  stats: ReputationStats;
  /** What the next tier still needs, in plain words; null at the top. */
  next: { tier: Tier; needs: string[] } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier);
}

export function maxTier(a: Tier, b: Tier | null): Tier {
  return b !== null && tierRank(b) > tierRank(a) ? b : a;
}

export function computeReputation(
  stats: ReputationStats,
  thresholds: ReputationThresholds = DEFAULT_THRESHOLDS,
  tierFloor: Tier | null = null,
): Reputation {
  const goldAttempts = stats.goldPassed + stats.goldFailed;
  const decided = stats.accepted + stats.rejected + stats.revised;
  const goldAccuracy = goldAttempts > 0 ? (stats.goldPassed / goldAttempts) * 100 : null;
  const acceptanceRate = decided > 0 ? (stats.accepted / decided) * 100 : null;

  let score: number | null = null;
  if (goldAccuracy !== null && acceptanceRate !== null) {
    score = 0.6 * goldAccuracy + 0.4 * acceptanceRate;
  } else {
    score = goldAccuracy ?? acceptanceRate;
  }

  const t = thresholds;
  const verifiedNeeds: string[] = [];
  if (goldAttempts < t.verifiedMinGold) {
    verifiedNeeds.push(`${t.verifiedMinGold - goldAttempts} more gold task(s)`);
  }
  if (goldAccuracy === null || goldAccuracy < t.verifiedMinGoldAccuracy) {
    verifiedNeeds.push(`gold accuracy of at least ${t.verifiedMinGoldAccuracy}%`);
  }
  const verified = verifiedNeeds.length === 0;

  const trustedNeeds: string[] = [];
  if (stats.accepted < t.trustedMinAccepted) {
    trustedNeeds.push(`${t.trustedMinAccepted - stats.accepted} more accepted task(s)`);
  }
  if (score === null || score < t.trustedMinScore) {
    trustedNeeds.push(`a score of at least ${t.trustedMinScore}`);
  }
  const trusted = verified && trustedNeeds.length === 0;

  const reviewerNeeds: string[] = [];
  if (stats.accepted < t.reviewerMinAccepted) {
    reviewerNeeds.push(`${t.reviewerMinAccepted - stats.accepted} more accepted task(s)`);
  }
  if (score === null || score < t.reviewerMinScore) {
    reviewerNeeds.push(`a score of at least ${t.reviewerMinScore}`);
  }
  const reviewer = trusted && reviewerNeeds.length === 0;

  const earned: Tier = reviewer ? "reviewer" : trusted ? "trusted" : verified ? "verified" : "new";
  const tier = maxTier(earned, tierFloor);

  const next =
    tier === "reviewer"
      ? null
      : tier === "trusted"
        ? { tier: "reviewer" as const, needs: reviewerNeeds }
        : tier === "verified"
          ? { tier: "trusted" as const, needs: trustedNeeds }
          : { tier: "verified" as const, needs: verifiedNeeds };

  return {
    tier,
    earned_tier: earned,
    tier_floor: tierFloor,
    score: score === null ? null : round2(score),
    gold_accuracy: goldAccuracy === null ? null : round2(goldAccuracy),
    acceptance_rate: acceptanceRate === null ? null : round2(acceptanceRate),
    stats,
    next,
  };
}

/** Which tasks a tier may see and claim. */
export interface TaskAccess {
  /** New contributors work gold (qualification) tasks only — no paid work. */
  goldOnly: boolean;
  /** Video needs Trusted. */
  video: boolean;
}

export function accessForTier(tier: Tier): TaskAccess {
  return {
    goldOnly: tier === "new",
    video: tierRank(tier) >= tierRank("trusted"),
  };
}

/** Null when allowed, otherwise the reason a tier may not claim this task. */
export function claimBlockReason(
  tier: Tier,
  task: { is_gold: boolean; modality: "image" | "video" },
): string | null {
  const access = accessForTier(tier);
  if (access.goldOnly && !task.is_gold) {
    return "New contributors start with qualification (gold) tasks; pass them to unlock paid tasks";
  }
  if (task.modality === "video" && !access.video) {
    return "Video tasks require the Trusted tier";
  }
  return null;
}
