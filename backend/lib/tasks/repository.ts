/**
 * Task row mapping helpers.
 *
 * `gold_answer` is server-only and must never be selected for contributor-facing
 * responses. `TASK_PUBLIC_COLUMNS` is the safe projection.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { TaskStatus } from "@/lib/tasks/stateMachine";
import type { Submission, Task } from "@/src/types/api";

export type TaskRow = Record<string, unknown>;

/** Columns safe to expose to contributors (never `gold_answer`). */
export const TASK_PUBLIC_COLUMNS =
  "id, job_id, asset_id, modality, status, is_gold, lease_owner, lease_expiry, created_at, updated_at, is_demo";

export function toTask(row: TaskRow, signedMediaUrl?: string): Task {
  const task: Task = {
    id: row.id as string,
    job_id: row.job_id as string,
    asset_id: row.asset_id as string,
    modality: row.modality as Task["modality"],
    status: row.status as Task["status"],
    is_gold: Boolean(row.is_gold),
    lease_owner: (row.lease_owner as string | null) ?? null,
    lease_expiry: (row.lease_expiry as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    is_demo: (row.is_demo as boolean) ?? false,
  };
  if (signedMediaUrl) task.signed_media_url = signedMediaUrl;
  return task;
}

/** Load a single task with its public projection, or throw 404. */
export async function loadTask(taskId: string): Promise<TaskRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_PUBLIC_COLUMNS)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load task: ${error.message}`);
  if (!data) throw HttpError.notFound("Task not found");
  return data as TaskRow;
}

/** Map a `submissions` row to the API `Submission` shape. */
export function toSubmission(row: TaskRow): Submission {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    contributor_id: row.contributor_id as string,
    version: Number(row.version),
    payload: row.payload as Submission["payload"],
    payload_hash: row.payload_hash as string,
    schema_version: row.schema_version as string,
    is_fast_flag: Boolean(row.is_fast_flag),
    submitted_at: row.submitted_at as string,
  };
}

/**
 * Persist a task status change. `releaseLease` also clears the lease (used
 * when a submission leaves the editing states for review).
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  { releaseLease = false }: { releaseLease?: boolean } = {},
): Promise<void> {
  const supabase = getSupabase();
  const patch: Record<string, unknown> = { status };
  if (releaseLease) {
    patch.lease_owner = null;
    patch.lease_expiry = null;
  }
  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (error) throw HttpError.internal(`Failed to update task: ${error.message}`);
}

/** Object key of a task's asset, used to sign a media URL. */
export async function getAssetObjectKey(assetId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("assets")
    .select("object_key")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load asset: ${error.message}`);
  if (!data?.object_key) throw HttpError.internal("Task asset is missing");
  return data.object_key as string;
}