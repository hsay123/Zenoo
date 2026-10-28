/**
 * Review routing (PRD §8.3 – risk-based review).
 *
 * After the automatic code checks and gold adjudication, a non-gold submission
 * is routed either to the MockAiReviewer first pass (eligible images) or
 * straight to the human queue (video, and risk signals such as fast
 * submissions, first-time contributors, or low gold accuracy).
 *
 * Pure and dependency-free so routing policy is easy to test.
 */

import type { Modality } from "@/src/types/api";

export const REVIEW_ROUTES = ["ai", "human"] as const;
export type ReviewRoute = (typeof REVIEW_ROUTES)[number];

/** Contributors below this completed-task count are treated as first-time. */
export const FIRST_TASK_THRESHOLD = 5;

/** Below this rolling gold accuracy (%), a submission goes to a human. */
export const GOLD_ACCURACY_FLOOR = 80;

export interface RoutingSignals {
  modality: Modality;
  isFastFlag: boolean;
  contributorGoldAccuracy: number | null;
  contributorTasksCompleted: number;
}

export interface RoutingDecision {
  route: ReviewRoute;
  reasons: string[];
}

/** Choose the review lane for a non-gold submission. */
export function routeSubmission(signals: RoutingSignals): RoutingDecision {
  if (signals.modality === "video") {
    return { route: "human", reasons: ["video requires human review"] };
  }

  const reasons: string[] = [];
  if (signals.isFastFlag) {
    reasons.push("submitted unusually fast");
  }
  if (signals.contributorTasksCompleted < FIRST_TASK_THRESHOLD) {
    reasons.push("first-time contributor");
  }
  if (
    signals.contributorGoldAccuracy != null &&
    signals.contributorGoldAccuracy < GOLD_ACCURACY_FLOOR
  ) {
    reasons.push("low gold accuracy");
  }

  if (reasons.length > 0) return { route: "human", reasons };
  return { route: "ai", reasons: ["image eligible for AI first pass"] };
}
