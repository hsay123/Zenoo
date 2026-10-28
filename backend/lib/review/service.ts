/**
 * Review workflow service.
 *
 * Two entry points:
 *   - `applyAutoRouting` runs after a non-gold submission: it picks a review
 *     lane (`lib/review/router.ts`), runs the MockAiReviewer on AI-eligible
 *     images, records the suggestion, and auto-applies a high-confidence
 *     decision (>= AI_CONFIDENCE_THRESHOLD). Low-confidence submissions stay
 *     `submitted` for the human queue.
 *   - `decideSubmission` records a human/admin decision and moves the task to
 *     `accepted` / `needs_revision` / `rejected`.
 *
 * A task is "awaiting review" iff its status is `submitted`; that is the single
 * source of truth for both the queue and the "already decided" conflict guard.
 */

import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { PageParams } from "@/lib/api/pagination";
import { assertLegalTransition, type TaskStatus } from "@/lib/tasks/stateMachine";
import { loadTask, toTask, updateTaskStatus } from "@/lib/tasks/repository";
import {
  insertReview,
  listSubmittedQueue,
  loadSubmission,
  type ReviewQueueFilters,
} from "@/lib/review/repository";
import { mockAiReviewer } from "@/lib/review/mockAiReviewer";
import { routeSubmission } from "@/lib/review/router";
import type { AuthUser } from "@/lib/auth/verifyToken";
import type {
  PaginatedList,
  ReasonCode,
  Review,
  ReviewDecision,
  ReviewQueueItem,
} from "@/src/types/api";

/** Map a review decision to the resulting task status. */
export function decisionToStatus(decision: ReviewDecision): TaskStatus {
  switch (decision) {
    case "accept":
      return "accepted";
    case "revise":
      return "needs_revision";
    case "reject":
      return "rejected";
  }
}

function assertReasonMatchesDecision(
  decision: ReviewDecision,
  reason: ReasonCode,
): void {
  if (decision === "accept" && reason !== "ACCEPTED") {
    throw HttpError.unprocessable("Validation failed", [
      {
        path: ["reason_code"],
        message: "an 'accept' decision requires reason_code ACCEPTED",
        code: "SCHEMA_INVALID",
      },
    ]);
  }
  if (decision !== "accept" && reason === "ACCEPTED") {
    throw HttpError.unprocessable("Validation failed", [
      {
        path: ["reason_code"],
        message: `a '${decision}' decision requires a non-ACCEPTED reason_code`,
        code: "SCHEMA_INVALID",
      },
    ]);
  }
}

async function loadContributorProfile(
  userId: string,
): Promise<{ gold_accuracy: number | null; tasks_completed: number } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("contributor_profiles")
    .select("gold_accuracy, tasks_completed")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw HttpError.internal(`Failed to load contributor profile: ${error.message}`);
  }
  if (!data) return null;
  return {
    gold_accuracy: data.gold_accuracy == null ? null : Number(data.gold_accuracy),
    tasks_completed: Number(data.tasks_completed ?? 0),
  };
}

async function loadJobLabelList(jobId: string): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .select("label_list")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load job: ${error.message}`);
  return (data?.label_list as string[] | undefined) ?? [];
}

/**
 * Run automatic routing for a freshly submitted (non-gold) submission.
 * Safe to call when the task is no longer `submitted` (it no-ops).
 */
export async function applyAutoRouting(submissionId: string): Promise<void> {
  const submission = await loadSubmission(submissionId);
  const task = toTask(await loadTask(submission.task_id));
  if (task.status !== "submitted") return;

  const profile = await loadContributorProfile(submission.contributor_id);
  const route = routeSubmission({
    modality: task.modality,
    isFastFlag: submission.is_fast_flag,
    contributorGoldAccuracy: profile?.gold_accuracy ?? null,
    contributorTasksCompleted: profile?.tasks_completed ?? 0,
  });
  if (route.route === "human") return;

  const labelList = await loadJobLabelList(task.job_id);
  const result = mockAiReviewer.review({
    modality: task.modality,
    payload: submission.payload,
    labelList,
  });

  await insertReview({
    submissionId: submission.id,
    reviewerType: "ai",
    reviewerId: null,
    decision: result.decision,
    reasonCode: result.reason_code,
    confidence: result.confidence,
    rubricVersion: result.rubric_version,
    notes: result.notes,
  });

  if (result.confidence >= getEnv().AI_CONFIDENCE_THRESHOLD) {
    const next = decisionToStatus(result.decision);
    assertLegalTransition(task.status as TaskStatus, next);
    await updateTaskStatus(task.id, next);
  }
}

export interface DecideSubmissionInput {
  submissionId: string;
  reviewer: AuthUser;
  decision: ReviewDecision;
  reasonCode: ReasonCode;
  confidence?: number;
  notes?: string;
  rubricVersion?: string;
}

/** Record a human/admin decision and apply the resulting task transition. */
export async function decideSubmission(
  input: DecideSubmissionInput,
): Promise<Review> {
  const submission = await loadSubmission(input.submissionId);
  if (submission.contributor_id === input.reviewer.id) {
    throw HttpError.forbidden("A reviewer cannot review their own submission");
  }
  assertReasonMatchesDecision(input.decision, input.reasonCode);

  const task = toTask(await loadTask(submission.task_id));
  if (task.status !== "submitted") {
    throw HttpError.conflict("Submission already has a final decision");
  }

  const next = decisionToStatus(input.decision);
  assertLegalTransition(task.status as TaskStatus, next);

  const review = await insertReview({
    submissionId: submission.id,
    reviewerType: "human",
    reviewerId: input.reviewer.id,
    decision: input.decision,
    reasonCode: input.reasonCode,
    confidence: input.confidence ?? null,
    rubricVersion: input.rubricVersion ?? null,
    notes: input.notes ?? null,
  });

  await updateTaskStatus(task.id, next);
  return review;
}

/**
 * List the queue of submissions awaiting review.
 *
 * `reviewer_type` is accepted for API compatibility; the submitted queue is the
 * human lane (AI-resolved submissions leave the `submitted` status).
 */
export async function listReviewQueue(
  filters: ReviewQueueFilters,
  page: PageParams,
): Promise<PaginatedList<ReviewQueueItem>> {
  return listSubmittedQueue(filters, page);
}
