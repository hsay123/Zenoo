/**
 * Appeals workflow service.
 *
 * A contributor appeals a `rejected` submission, moving the task to `appealed`.
 * A reviewer/admin then adjudicates: upholding the appeal moves the task to
 * `accepted` (and records a human `accept` review with `APPEAL_UPHELD`), while
 * dismissing it returns the task to `rejected` (`APPEAL_DISMISSED`). This is the
 * only path by which a rejected task can ever become payable.
 */

import { HttpError } from "@/lib/api/errors";
import type { PageParams } from "@/lib/api/pagination";
import { assertLegalTransition, type TaskStatus } from "@/lib/tasks/stateMachine";
import { loadTask, toTask, updateTaskStatus } from "@/lib/tasks/repository";
import { insertReview, loadSubmission } from "@/lib/review/repository";
import {
  findAppealForSubmission,
  insertAppeal,
  listOpenAppeals,
  loadAppeal,
  resolveAppeal,
} from "@/lib/appeals/repository";
import type { AuthUser } from "@/lib/auth/verifyToken";
import type {
  Appeal,
  AppealQueueItem,
  AppealStatus,
  PaginatedList,
  ReasonCode,
} from "@/src/types/api";

export type AppealDecision = "accept" | "reject";

/** Task status produced by an appeal decision. */
export function appealDecisionToStatus(decision: AppealDecision): TaskStatus {
  return decision === "accept" ? "accepted" : "rejected";
}

/** Appeal record status produced by an appeal decision. */
export function appealDecisionToAppealStatus(
  decision: AppealDecision,
): AppealStatus {
  return decision === "accept" ? "accepted" : "rejected";
}

/** Upholding an appeal requires APPEAL_UPHELD; dismissing requires APPEAL_DISMISSED. */
export function assertAppealReasonMatch(
  decision: AppealDecision,
  reasonCode: ReasonCode,
): void {
  const expected = decision === "accept" ? "APPEAL_UPHELD" : "APPEAL_DISMISSED";
  if (reasonCode !== expected) {
    throw HttpError.unprocessable("Validation failed", [
      {
        path: ["reason_code"],
        message: `a '${decision}' appeal decision requires reason_code ${expected}`,
        code: "SCHEMA_INVALID",
      },
    ]);
  }
}

export interface SubmitAppealInput {
  submissionId: string;
  contributor: AuthUser;
  reason: string;
}

/** Appeal a rejected submission (contributor must own it). */
export async function submitAppeal(input: SubmitAppealInput): Promise<Appeal> {
  const submission = await loadSubmission(input.submissionId);
  if (submission.contributor_id !== input.contributor.id) {
    throw HttpError.forbidden("You can only appeal your own submission");
  }

  const task = toTask(await loadTask(submission.task_id));
  if (task.status !== "rejected") {
    throw HttpError.conflict("Only rejected submissions can be appealed");
  }

  const existing = await findAppealForSubmission(submission.id);
  if (existing) {
    throw HttpError.conflict("This submission already has an appeal");
  }

  const appeal = await insertAppeal({
    submissionId: submission.id,
    contributorId: input.contributor.id,
    reason: input.reason,
  });

  assertLegalTransition("rejected", "appealed");
  await updateTaskStatus(task.id, "appealed");
  return appeal;
}

export interface DecideAppealInput {
  appealId: string;
  reviewer: AuthUser;
  decision: AppealDecision;
  reasonCode: ReasonCode;
  notes?: string;
}

/** Uphold or dismiss an open appeal and apply the resulting task transition. */
export async function decideAppeal(input: DecideAppealInput): Promise<Appeal> {
  const appeal = await loadAppeal(input.appealId);
  if (appeal.status !== "open") {
    throw HttpError.conflict("Appeal has already been resolved");
  }

  const submission = await loadSubmission(appeal.submission_id);
  if (submission.contributor_id === input.reviewer.id) {
    throw HttpError.forbidden("A reviewer cannot adjudicate their own submission");
  }

  assertAppealReasonMatch(input.decision, input.reasonCode);

  const task = toTask(await loadTask(submission.task_id));
  if (task.status !== "appealed") {
    throw HttpError.conflict("Task is not awaiting appeal adjudication");
  }

  const nextStatus = appealDecisionToStatus(input.decision);
  assertLegalTransition(task.status as TaskStatus, nextStatus);

  await insertReview({
    submissionId: submission.id,
    reviewerType: "human",
    reviewerId: input.reviewer.id,
    decision: input.decision,
    reasonCode: input.reasonCode,
    notes: input.notes ?? null,
  });

  const resolved = await resolveAppeal(appeal.id, {
    status: appealDecisionToAppealStatus(input.decision),
    adjudicatorId: input.reviewer.id,
    resolutionNotes: input.notes ?? null,
  });

  await updateTaskStatus(task.id, nextStatus);
  return resolved;
}

/** List open appeals for the reviewer/admin queue. */
export async function listAppealsQueue(
  page: PageParams,
): Promise<PaginatedList<AppealQueueItem>> {
  return listOpenAppeals(page);
}