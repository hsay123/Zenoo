/**
 * Task lease helpers.
 *
 * A lease grants a contributor exclusive access to a task for
 * `LEASE_MINUTES`. Expired leases are released back to `available`.
 */

import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";

/** Compute a lease expiry timestamp from now (or an injected clock). */
export function leaseExpiryFromNow(now: Date = new Date()): string {
  const minutes = getEnv().LEASE_MINUTES;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/** True when `expiry` is in the past relative to `now`. */
export function isLeaseExpired(
  expiry: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiry) return false;
  return new Date(expiry).getTime() <= now.getTime();
}

/**
 * Release expired leases, resetting matching tasks to `available`.
 *
 * @param taskId  Restrict the sweep to a single task (used by claim).
 * @returns       Number of tasks released.
 */
export async function releaseExpiredLeases(taskId?: string): Promise<number> {
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("tasks")
    .update({ status: "available", lease_owner: null, lease_expiry: null })
    .in("status", ["claimed", "draft"])
    .lt("lease_expiry", nowIso);

  if (taskId) query = query.eq("id", taskId);

  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(`Failed to release expired leases: ${error.message}`);
  }
  return (data ?? []).length;
}
