/**
 * Pure helpers for assembling the review queue.
 *
 * Kept apart from the Supabase queries so the "latest version wins" rule can be
 * unit tested without a database.
 */

export interface VersionedQueueRow {
  version: unknown;
  submitted_at: unknown;
  task: Record<string, unknown>;
}

/**
 * Collapse append-only submission rows to the latest version of each task,
 * oldest-submitted first.
 *
 * A task sent back for revision keeps its historical `submissions` rows, and
 * after the contributor resubmits they all match `task.status = 'submitted'`.
 * Without this dedupe the queue would list the same task once per version, and a
 * reviewer could open a stale version.
 */
export function latestVersionPerTask<T extends VersionedQueueRow>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const taskId = String(row.task.id);
    const current = latest.get(taskId);
    if (!current || Number(row.version) > Number(current.version)) {
      latest.set(taskId, row);
    }
  }
  return Array.from(latest.values()).sort(
    (a, b) =>
      new Date(a.submitted_at as string).getTime() -
      new Date(b.submitted_at as string).getTime(),
  );
}
