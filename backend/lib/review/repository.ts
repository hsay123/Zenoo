/**
 * Review row mapping + queries.
 *
 * `insertReview` is shared by the gold adjudication flow (Phase 4) and the
 * human/AI review flows (Phase 5). The queue query only ever exposes the public
 * task projection (`TASK_PUBLIC_COLUMNS`), so `gold_answer` never leaks.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import { paginated, type PageParams } from "@/lib/api/pagination";
import {
  TASK_PUBLIC_COLUMNS,
  toSubmission,
  toTask,
  type TaskRow,
} from "@/lib/tasks/repository";
import { toJob, type JobRow } from "@/lib/jobs/repository";
import { latestVersionPerTask } from "@/lib/review/queue";
import type {
  Job,
  Modality,
  PaginatedList,
  ReasonCode,
  Review,
  ReviewDecision,
  ReviewerType,
  ReviewQueueItem,
  Submission,
} from "@/src/types/api";

type Row = Record<string, unknown>;

/** A submission row joined to its task, as returned by the queue query. */
type QueueSubmissionRow = Row & {
  version: unknown;
  submitted_at: unknown;
  task: TaskRow;
};

export function toReview(row: Row): Review {
  return {
    id: row.id as string,
    submission_id: row.submission_id as string,
    reviewer_type: row.reviewer_type as ReviewerType,
    reviewer_id: (row.reviewer_id as string | null) ?? null,
    decision: row.decision as ReviewDecision,
    reason_code: row.reason_code as ReasonCode,
    confidence: row.confidence == null ? null : Number(row.confidence),
    rubric_version: (row.rubric_version as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export interface InsertReviewInput {
  submissionId: string;
  reviewerType: ReviewerType;
  reviewerId: string | null;
  decision: ReviewDecision;
  reasonCode: ReasonCode;
  confidence?: number | null;
  rubricVersion?: string | null;
  notes?: string | null;
}

/** Append a review decision (append-only; never updated). */
export async function insertReview(input: InsertReviewInput): Promise<Review> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      submission_id: input.submissionId,
      reviewer_type: input.reviewerType,
      reviewer_id: input.reviewerId,
      decision: input.decision,
      reason_code: input.reasonCode,
      confidence: input.confidence ?? null,
      rubric_version: input.rubricVersion ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw HttpError.internal(`Failed to record review: ${error.message}`);
  return toReview(data as Row);
}

/** Load a submission by id, or throw 404. */
export async function loadSubmission(submissionId: string): Promise<Submission> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load submission: ${error.message}`);
  if (!data) throw HttpError.notFound("Submission not found");
  return toSubmission(data as Row);
}

export interface ReviewQueueFilters {
  modality?: Modality;
  reviewer_type?: ReviewerType;
}

/**
 * List submissions whose task is awaiting review (`status = 'submitted'`),
 * oldest first, with their task and job attached.
 */
export async function listSubmittedQueue(
  filters: ReviewQueueFilters,
  page: PageParams,
): Promise<PaginatedList<ReviewQueueItem>> {
  const supabase = getSupabase();

  let query = supabase
    .from("submissions")
    .select(`*, task:tasks!inner(${TASK_PUBLIC_COLUMNS})`)
    .eq("task.status", "submitted")
    .order("version", { ascending: false });

  if (filters.modality) query = query.eq("task.modality", filters.modality);

  const { data, error } = await query;
  if (error) throw HttpError.internal(`Failed to list review queue: ${error.message}`);

  // Submissions are append-only: after a revision request the task keeps its
  // older versions, all of which now match `task.status = 'submitted'`. Present
  // only the latest version of each task, then paginate the deduped set.
  const ordered = latestVersionPerTask(
    (data ?? []) as unknown as QueueSubmissionRow[],
  );
  const total = ordered.length;
  const rows = ordered.slice(page.from, page.to + 1);

  const jobIds = Array.from(
    new Set(rows.map((row) => row.task.job_id as string)),
  );
  const jobMap = new Map<string, Job>();
  if (jobIds.length > 0) {
    const { data: jobs, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .in("id", jobIds);
    if (jobError) {
      throw HttpError.internal(`Failed to load queue jobs: ${jobError.message}`);
    }
    for (const job of jobs ?? []) {
      jobMap.set(job.id as string, toJob(job as JobRow));
    }
  }

  const items: ReviewQueueItem[] = rows.map((row) => {
    const taskRow = row.task;
    const job = jobMap.get(taskRow.job_id as string) as Job;
    return { ...toSubmission(row), task: toTask(taskRow), job };
  });

  return paginated(items, total, page);
}
