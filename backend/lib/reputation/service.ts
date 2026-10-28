/**
 * Load a contributor's reputation from live data and cache it on their profile.
 *
 * Inputs (all existing data, nothing new to record):
 *   - gold results: `reviews` with reviewer_type 'code' on the contributor's
 *     gold submissions — ACCEPTED = pass, GOLD_FAIL = fail;
 *   - outcomes: the current status of each non-gold task they submitted
 *     (accepted/paid = accepted, rejected = rejected, needs_revision = revised;
 *     still in review or appealed = not counted yet).
 *
 * Computed on demand (task listing, claim, earnings), so no decision path has
 * to remember to update it; the result is written back to
 * contributor_profiles as a display cache.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { Env } from "@/lib/env";
import {
  TIERS,
  computeReputation,
  type Reputation,
  type ReputationStats,
  type ReputationThresholds,
  type Tier,
} from "@/lib/reputation/score";

export function thresholdsFromEnv(env: Env): ReputationThresholds {
  return {
    verifiedMinGold: env.REPUTATION_VERIFIED_MIN_GOLD,
    verifiedMinGoldAccuracy: env.REPUTATION_VERIFIED_MIN_GOLD_ACCURACY,
    trustedMinAccepted: env.REPUTATION_TRUSTED_MIN_ACCEPTED,
    trustedMinScore: env.REPUTATION_TRUSTED_MIN_SCORE,
    reviewerMinAccepted: env.REPUTATION_REVIEWER_MIN_ACCEPTED,
    reviewerMinScore: env.REPUTATION_REVIEWER_MIN_SCORE,
  };
}

const asTier = (value: unknown): Tier | null =>
  typeof value === "string" && (TIERS as readonly string[]).includes(value) ? (value as Tier) : null;

type SubmissionRow = {
  id: string;
  task_id: string;
  version: number;
  task: { is_gold: boolean; status: string } | null;
};

export async function loadReputationStats(contributorId: string): Promise<ReputationStats> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("id, task_id, version, task:tasks!inner(is_gold, status)")
    .eq("contributor_id", contributorId)
    .order("version", { ascending: false });
  if (error) throw HttpError.internal(`Failed to load submissions: ${error.message}`);
  const rows = (data ?? []) as unknown as SubmissionRow[];

  // Gold: every scored attempt counts (one code review per gold submission).
  const goldSubmissionIds = rows.filter((r) => r.task?.is_gold).map((r) => r.id);
  let goldPassed = 0;
  let goldFailed = 0;
  if (goldSubmissionIds.length > 0) {
    const { data: reviews, error: reviewError } = await supabase
      .from("reviews")
      .select("submission_id, reason_code")
      .eq("reviewer_type", "code")
      .in("submission_id", goldSubmissionIds);
    if (reviewError) throw HttpError.internal(`Failed to load gold results: ${reviewError.message}`);
    for (const review of reviews ?? []) {
      if (review.reason_code === "ACCEPTED") goldPassed += 1;
      else if (review.reason_code === "GOLD_FAIL") goldFailed += 1;
    }
  }

  // Outcomes: one per non-gold task (its current status).
  const seen = new Set<string>();
  let accepted = 0;
  let rejected = 0;
  let revised = 0;
  for (const row of rows) {
    if (!row.task || row.task.is_gold || seen.has(row.task_id)) continue;
    seen.add(row.task_id);
    if (row.task.status === "accepted" || row.task.status === "paid") accepted += 1;
    else if (row.task.status === "rejected") rejected += 1;
    else if (row.task.status === "needs_revision") revised += 1;
  }

  return { goldPassed, goldFailed, accepted, rejected, revised };
}

export interface ContributorReputation extends Reputation {
  /** False when reputation gating is turned off or not yet migrated. */
  gating: boolean;
}

/**
 * The contributor's current reputation. If the migration-012 columns are not
 * present yet, gating is reported off so no existing contributor loses
 * access because of a deploy that ran ahead of its migration.
 */
export async function getContributorReputation(
  contributorId: string,
  env: Env,
): Promise<ContributorReputation> {
  const supabase = getSupabase();
  const { data: profile, error } = await supabase
    .from("contributor_profiles")
    .select("tier_floor")
    .eq("user_id", contributorId)
    .maybeSingle();
  const migrated = !error;
  if (error) {
    console.warn(`[reputation] tier columns unavailable (${error.message}); gating disabled`);
  }

  const stats = await loadReputationStats(contributorId);
  const reputation = computeReputation(
    stats,
    thresholdsFromEnv(env),
    migrated ? asTier(profile?.tier_floor) : null,
  );

  if (migrated) {
    // Best-effort display cache; a failure here never blocks the caller.
    const cache = {
      reputation_score: reputation.score,
      tier: reputation.tier,
      reputation_updated_at: new Date().toISOString(),
    };
    const write = profile
      ? supabase.from("contributor_profiles").update(cache).eq("user_id", contributorId)
      : supabase.from("contributor_profiles").insert({ user_id: contributorId, ...cache });
    const { error: cacheError } = await write;
    if (cacheError) console.warn(`[reputation] cache write failed: ${cacheError.message}`);
  }

  return { ...reputation, gating: migrated && env.REPUTATION_GATING === "on" };
}
