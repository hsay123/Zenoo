/**
 * Job lifecycle transitions (pause / resume / close).
 *
 * `assertTransition` is the pure guard (unit-tested); `transitionJob` performs
 * the guarded, atomic update (the `.in("status", from)` predicate makes the
 * change safe against a concurrent transition).
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import { toJob, type JobRow } from "@/lib/jobs/repository";
import type { Job, JobStatus } from "@/src/types/api";

/** Allowed lifecycle moves, keyed by target status. */
export const TRANSITIONS: Record<"pause" | "resume" | "close", JobStatus[]> = {
  pause: ["published"],
  resume: ["paused"],
  close: ["published", "paused"],
};

export function assertTransition(
  current: JobStatus,
  from: JobStatus[],
  to: JobStatus,
): void {
  if (!from.includes(current)) {
    throw HttpError.conflict(
      `Job cannot move from '${current}' to '${to}'`,
    );
  }
}

export async function transitionJob(
  id: string,
  job: Job,
  from: JobStatus[],
  to: JobStatus,
): Promise<Job> {
  assertTransition(job.status, from, to);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: to })
    .eq("id", id)
    .in("status", from)
    .select("*")
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to update job: ${error.message}`);
  if (!data) throw HttpError.conflict("Job status changed during the request");

  return toJob(data as JobRow);
}
