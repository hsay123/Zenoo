/**
 * getEarningsSummary hides automation fixtures in production.
 *
 * The e2e suite writes real submissions against `is_test` jobs. Those must not
 * appear in a real contributor's history ("Resume your work") or in their
 * totals, exactly like they are hidden from the available queue.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/env";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { submissions: [], jobs: [], receipts: [] };

let env = { NODE_ENV: "production" } as unknown as Env;

vi.mock("@/lib/env", () => ({ getEnv: () => env }));

/** Minimal PostgREST-like builder for the selects used by earnings. */
function table(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: (col: string, value: unknown) => {
      filters.push((row) => row[col] === value);
      return builder;
    },
    in: (col: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[col]));
      return builder;
    },
    then: (resolve: (v: { data: Row[]; error: null }) => void) =>
      resolve({ data: db[name].filter((row) => filters.every((f) => f(row))), error: null }),
  };
  return builder;
}

vi.mock("@/lib/db/supabase", () => ({
  getSupabase: () => ({ from: (name: string) => table(name) }),
}));

const { getEarningsSummary } = await import("../service");

function seed() {
  db.jobs = [
    { id: "job-real", title: "Real job", reward_per_task: "0.05", is_test: false },
    { id: "job-test", title: "E2E fixture", reward_per_task: "0.1", is_test: true },
  ];
  db.submissions = [
    {
      id: "sub-real",
      task_id: "task-real",
      version: 1,
      submitted_at: "2026-10-30T09:00:00Z",
      contributor_id: "user-1",
      task: { job_id: "job-real", status: "paid" },
    },
    {
      id: "sub-test",
      task_id: "task-test",
      version: 1,
      submitted_at: "2026-10-30T10:00:00Z",
      contributor_id: "user-1",
      task: { job_id: "job-test", status: "accepted" },
    },
  ];
  db.receipts = [
    { id: "rec-real", submission_id: "sub-real", tx_hash: "0xabc", is_mock: false },
  ];
}

beforeEach(() => {
  seed();
  env = { NODE_ENV: "production" } as unknown as Env;
});

describe("getEarningsSummary test-job visibility", () => {
  it("drops test fixtures from history and totals in production", async () => {
    const summary = await getEarningsSummary("user-1");

    expect(summary.tasks.map((t) => t.task_id)).toEqual(["task-real"]);
    expect(summary.total_paid).toBe("0.05");
    expect(summary.total_pending).toBe("0");
    expect(summary.total_accepted).toBe(1);
  });

  it("keeps test fixtures visible in development for the e2e suite", async () => {
    env = { NODE_ENV: "development" } as unknown as Env;

    const summary = await getEarningsSummary("user-1");

    expect(summary.tasks.map((t) => t.task_id)).toEqual(["task-test", "task-real"]);
    expect(summary.total_paid).toBe("0.05");
    expect(summary.total_pending).toBe("0.1");
    expect(summary.total_accepted).toBe(2);
  });

  it("honours the HIDE_TEST_JOBS override outside production", async () => {
    env = { NODE_ENV: "development", HIDE_TEST_JOBS: "true" } as unknown as Env;

    const summary = await getEarningsSummary("user-1");

    expect(summary.tasks.map((t) => t.task_id)).toEqual(["task-real"]);
  });
});
