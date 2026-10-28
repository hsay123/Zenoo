/**
 * Appeal row mapping + queries.
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
import type {
  Appeal,
  AppealQueueItem,
  AppealStatus,
  Job,
  PaginatedList,
} from "@/src/types/api";

type Row = Record<string, unknown>;

export function toAppeal(row: Row): Appeal {
  return {
    id: row.id as string,
    submission_id: row.submission_id as string,
    contributor_id: row.contributor_id as string,
    reason: row.reason as string,
    status: row.status as AppealStatus,
    adjudicator_id: (row.adjudicator_id as string | null) ?? null,
    resolution_notes: (row.resolution_notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export interface InsertAppealInput {
  submissionId: string;
  contributorId: string;
  reason: string;
}

export async function insertAppeal(input: InsertAppealInput): Promise<Appeal> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("appeals")
    .insert({
      submission_id: input.submissionId,
      contributor_id: input.contributorId,
      reason: input.reason,
      status: "open",
    })
    .select("*")
    .single();
  if (error) throw HttpError.internal(`Failed to record appeal: ${error.message}`);
  return toAppeal(data as Row);
}

/** Load an appeal by id, or throw 404. */
export async function loadAppeal(appealId: string): Promise<Appeal> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("appeals")
    .select("*")
    .eq("id", appealId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load appeal: ${error.message}`);
  if (!data) throw HttpError.notFound("Appeal not found");
  return toAppeal(data as Row);
}

/** Most recent appeal for a submission (any status), or null. */
export async function findAppealForSubmission(
  submissionId: string,
): Promise<Appeal | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("appeals")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load appeal: ${error.message}`);
  return data ? toAppeal(data as Row) : null;
}

export interface ResolveAppealInput {
  status: AppealStatus;
  adjudicatorId: string;
  resolutionNotes: string | null;
}

export async function resolveAppeal(
  appealId: string,
  input: ResolveAppealInput,
): Promise<Appeal> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("appeals")
    .update({
      status: input.status,
      adjudicator_id: input.adjudicatorId,
      resolution_notes: input.resolutionNotes,
    })
    .eq("id", appealId)
    .select("*")
    .single();
  if (error) throw HttpError.internal(`Failed to resolve appeal: ${error.message}`);
  return toAppeal(data as Row);
}

/** List open appeals, oldest first, with submission, task and job attached. */
export async function listOpenAppeals(
  page: PageParams,
): Promise<PaginatedList<AppealQueueItem>> {
  const supabase = getSupabase();

  const { data, error, count } = await supabase
    .from("appeals")
    .select(
      `*, submission:submissions!inner(*, task:tasks!inner(${TASK_PUBLIC_COLUMNS}))`,
      { count: "exact" },
    )
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .range(page.from, page.to);
  if (error) throw HttpError.internal(`Failed to list appeals: ${error.message}`);

  const rows = (data ?? []) as Array<Row & { submission: Row & { task: TaskRow } }>;

  const jobIds = Array.from(
    new Set(rows.map((row) => row.submission.task.job_id as string)),
  );
  const jobMap = new Map<string, Job>();
  if (jobIds.length > 0) {
    const { data: jobs, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .in("id", jobIds);
    if (jobError) {
      throw HttpError.internal(`Failed to load appeal jobs: ${jobError.message}`);
    }
    for (const job of jobs ?? []) {
      jobMap.set(job.id as string, toJob(job as JobRow));
    }
  }

  const items: AppealQueueItem[] = rows.map((row) => ({
    ...toAppeal(row),
    submission: toSubmission(row.submission),
    task: toTask(row.submission.task),
    job: jobMap.get(row.submission.task.job_id as string) as Job,
  }));

  return paginated(items, count ?? items.length, page);
}