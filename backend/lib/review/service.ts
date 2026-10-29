/**
 * Review workflow service.
 *
 * Two entry points:
 *   - `applyAutoRouting` runs after a non-gold submission: it picks a review
 *     lane (`lib/review/router.ts`), runs the AI first pass on AI-eligible
 *     images (Claude when configured, else the MockAiReviewer — see
 *     `lib/review/aiReviewer.ts`), records the suggestion, and auto-applies a
 *     high-confidence decision (>= AI_CONFIDENCE_THRESHOLD). Low-confidence
 *     or failed reviews leave the submission `submitted` for the human queue.
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
import { after } from "next/server";
import type { AiReviewInput, AiReviewer } from "@/lib/review/mockAiReviewer";
import {
  AI_REVIEW_TIMEOUT_MS,
  getAiReviewer,
  loadImageForReview,
} from "@/lib/review/aiReviewer";
import { routeSubmission } from "@/lib/review/router";
import { accountsLinked, openFlagsFor } from "@/lib/integrity/service";
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

async function loadJobReviewContext(
  jobId: string,
): Promise<{ labelList: string[]; rubric: Record<string, unknown> | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .select("label_list, rubric")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load job: ${error.message}`);
  return {
    labelList: (data?.label_list as string[] | undefined) ?? [],
    rubric: (data?.rubric as Record<string, unknown> | null | undefined) ?? null,
  };
}

async function loadAssetForReview(
  assetId: string,
): Promise<{ objectKey: string; width: number | null; height: number | null }> {
  const { data, error } = await getSupabase()
    .from("assets")
    .select("object_key, width, height")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load asset: ${error.message}`);
  if (!data?.object_key) throw HttpError.internal("Task asset is missing");
  return {
    objectKey: data.object_key as string,
    width: (data.width as number | null) ?? null,
    height: (data.height as number | null) ?? null,
  };
}

/** Move a task out of `submitted` only if nobody else decided it meanwhile. */
async function updateTaskStatusIfSubmitted(taskId: string, next: TaskStatus): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("tasks")
    .update({ status: next })
    .eq("id", taskId)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to update task: ${error.message}`);
  return Boolean(data);
}

/**
 * Schedule work to run after the HTTP response is sent (Next.js `after`), so a
 * contributor's submit never waits on a model call. Outside a request scope
 * (scripts, tests) it runs in the background instead.
 */
function deferAfterResponse(work: () => Promise<void>): void {
  try {
    after(work);
  } catch {
    void work();
  }
}

export interface AutoRoutingDeps {
  reviewer?: AiReviewer;
  /** How model reviews are deferred; defaults to running after the response. */
  defer?: (work: () => Promise<void>) => void;
}

/**
 * Run automatic routing for a freshly submitted (non-gold) submission.
 * Safe to call when the task is no longer `submitted` (it no-ops).
 *
 * The mock reviewer runs inline, as before. The model reviewer runs after the
 * response; any failure or timeout leaves the task `submitted` for a human.
 */
export async function applyAutoRouting(
  submissionId: string,
  deps: AutoRoutingDeps = {},
): Promise<void> {
  const submission = await loadSubmission(submissionId);
  const task = toTask(await loadTask(submission.task_id));
  if (task.status !== "submitted") return;

  const profile = await loadContributorProfile(submission.contributor_id);
  const flags = await openFlagsFor(submission.contributor_id);
  const route = routeSubmission({
    modality: task.modality,
    isFastFlag: submission.is_fast_flag,
    contributorGoldAccuracy: profile?.gold_accuracy ?? null,
    contributorTasksCompleted: profile?.tasks_completed ?? 0,
    integrityFlagged: flags.length > 0,
  });
  if (route.route === "human") return;

  const env = getEnv();
  const reviewer = deps.reviewer ?? getAiReviewer(env);
  const { labelList, rubric } = await loadJobReviewContext(task.job_id);

  const run = async () => {
    const input: AiReviewInput = {
      modality: task.modality,
      payload: submission.payload,
      labelList,
      rubric,
    };
    if (reviewer.kind === "model") {
      const asset = await loadAssetForReview(task.asset_id);
      input.image = {
        width: asset.width,
        height: asset.height,
        load: () => loadImageForReview(asset.objectKey),
      };
    }

    const result = await withTimeout(
      Promise.resolve(reviewer.review(input)),
      AI_REVIEW_TIMEOUT_MS,
    );

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

    if (result.confidence >= env.AI_CONFIDENCE_THRESHOLD) {
      const next = decisionToStatus(result.decision);
      assertLegalTransition("submitted", next);
      await updateTaskStatusIfSubmitted(task.id, next);
    }
  };

  if (reviewer.kind !== "model") {
    await run();
    return;
  }

  // Fail safe: any error or timeout leaves the task `submitted` for a human.
  (deps.defer ?? deferAfterResponse)(async () => {
    try {
      await run();
    } catch (cause) {
      console.warn(
        `[review] AI first pass failed for submission ${submission.id}; ` +
          `left for human review: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`AI review timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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
  // An open integrity flag links these accounts (HHG F6.2): another reviewer decides.
  if (await accountsLinked(input.reviewer.id, submission.contributor_id)) {
    throw HttpError.forbidden(
      "This reviewer is linked to the contributor by an open integrity flag; another reviewer must decide",
    );
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
