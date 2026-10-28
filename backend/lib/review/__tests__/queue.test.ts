/**
 * Review-queue dedupe tests.
 *
 * Regression: a task that was sent back for revision and then resubmitted has
 * several `submissions` rows, all matching `task.status = 'submitted'`. The
 * queue must list only the latest version of each task.
 */

import { describe, it, expect } from "vitest";
import { latestVersionPerTask } from "../queue";

const row = (taskId: string, version: number, submittedAt: string) => ({
  id: `sub-${taskId}-v${version}`,
  task: { id: taskId },
  version,
  submitted_at: submittedAt,
});

describe("latestVersionPerTask", () => {
  it("keeps only the highest version of each task", () => {
    const rows = [
      row("t1", 1, "2026-01-01T00:00:00Z"),
      row("t1", 2, "2026-01-01T00:05:00Z"),
      row("t2", 1, "2026-01-01T00:01:00Z"),
    ];
    const result = latestVersionPerTask(rows);
    expect(result.map((r) => r.id)).toEqual(["sub-t2-v1", "sub-t1-v2"]);
  });

  it("orders by submission time, oldest first", () => {
    const rows = [
      row("t2", 1, "2026-01-01T00:10:00Z"),
      row("t1", 1, "2026-01-01T00:01:00Z"),
      row("t3", 1, "2026-01-01T00:05:00Z"),
    ];
    expect(latestVersionPerTask(rows).map((r) => r.task.id)).toEqual([
      "t1",
      "t3",
      "t2",
    ]);
  });

  it("compares versions numerically, not lexically", () => {
    const rows = [
      row("t1", 9, "2026-01-01T00:00:00Z"),
      row("t1", 10, "2026-01-01T00:00:01Z"),
    ];
    expect(latestVersionPerTask(rows)[0].version).toBe(10);
  });

  it("returns an empty list for an empty queue", () => {
    expect(latestVersionPerTask([])).toEqual([]);
  });
});
