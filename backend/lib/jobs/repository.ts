/**
 * Job row mapping and ownership helpers.
 *
 * Numeric columns come back as strings from PostgREST, so `toJob` normalises
 * `reward_per_task` / `budget` to the decimal-string form used by the API types.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/verifyToken";
import type { Job } from "@/src/types/api";

export type JobRow = Record<string, unknown>;

export function toJob(row: JobRow): Job {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    schema_version_id: (row.schema_version_id as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    modality: row.modality as Job["modality"],
    reward_per_task: String(row.reward_per_task),
    budget: String(row.budget),
    deadline: (row.deadline as string | null) ?? null,
    policy_hash: (row.policy_hash as string | null) ?? null,
    rubric: (row.rubric as Job["rubric"]) ?? null,
    status: row.status as Job["status"],
    chain_job_id: (row.chain_job_id as string | null) ?? null,
    label_list: (row.label_list as string[]) ?? [],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    // Funding fields
    funding_status: row.funding_status as Job["funding_status"],
    // NUMERIC comes back from PostgREST as a JSON number (e.g. the default 0);
    // normalise to the decimal-string form, like reward_per_task and budget.
    funded_amount: row.funded_amount == null ? null : String(row.funded_amount),
    funding_tx_hash: (row.funding_tx_hash as string | null) ?? null,
    funding_wallet_address: (row.funding_wallet_address as string | null) ?? null,
    funded_at: (row.funded_at as string | null) ?? null,
    is_demo: (row.is_demo as boolean) ?? false,
    is_test: (row.is_test as boolean) ?? false,
  };
}

/** True when `projectId` belongs to `buyerId`. */
export async function buyerOwnsProject(
  projectId: string,
  buyerId: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load project: ${error.message}`);
  return data != null;
}

/**
 * Load a job, enforcing that `actor` may access it:
 * admins see everything; buyers only their own projects' jobs.
 */
export async function loadJobForActor(
  jobId: string,
  actor: AuthUser,
): Promise<Job> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load job: ${error.message}`);
  if (!data) throw HttpError.notFound("Job not found");

  const row = data as JobRow;
  if (actor.role !== "admin") {
    const owns = await buyerOwnsProject(row.project_id as string, actor.id);
    if (!owns) throw HttpError.forbidden("You do not own this job");
  }
  return toJob(row);
}

/**
 * Status of a job by id, or null if it does not exist. Used by the claim route
 * to refuse new claims against paused/closed jobs.
 */
export async function getJobStatus(jobId: string): Promise<Job["status"] | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load job: ${error.message}`);
  return (data?.status as Job["status"]) ?? null;
}