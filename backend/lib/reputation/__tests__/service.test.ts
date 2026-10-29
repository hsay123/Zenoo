/**
 * getContributorReputation: stats from submissions/reviews, the tier floor,
 * the display cache, and the "migration not applied" safety valve.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/env";

type Row = Record<string, unknown>;
const state: {
  submissions: Row[];
  reviews: Row[];
  profile: Row | null;
  profileError: { message: string } | null;
  writes: Row[];
} = { submissions: [], reviews: [], profile: null, profileError: null, writes: [] };

vi.mock("@/lib/db/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        order: () => b,
        maybeSingle: async () =>
          table === "contributor_profiles"
            ? { data: state.profile, error: state.profileError }
            : { data: null, error: null },
        update: (patch: Row) => {
          state.writes.push({ op: "update", ...patch });
          return { eq: async () => ({ error: null }) };
        },
        insert: async (row: Row) => {
          state.writes.push({ op: "insert", ...row });
          return { error: null };
        },
        then: (resolve: (v: { data: Row[]; error: null }) => void) =>
          resolve({ data: table === "submissions" ? state.submissions : state.reviews, error: null }),
      };
      return b;
    },
  }),
}));

const { getContributorReputation, loadReputationStats } = await import("../service");

const ENV = {
  REPUTATION_GATING: "on",
  REPUTATION_VERIFIED_MIN_GOLD: 5,
  REPUTATION_VERIFIED_MIN_GOLD_ACCURACY: 80,
  REPUTATION_TRUSTED_MIN_ACCEPTED: 50,
  REPUTATION_TRUSTED_MIN_SCORE: 85,
  REPUTATION_REVIEWER_MIN_ACCEPTED: 200,
  REPUTATION_REVIEWER_MIN_SCORE: 92,
} as unknown as Env;

const sub = (id: string, taskId: string, version: number, is_gold: boolean, status: string) => ({
  id,
  task_id: taskId,
  version,
  task: { is_gold, status },
});

beforeEach(() => {
  state.submissions = [];
  state.reviews = [];
  state.profile = null;
  state.profileError = null;
  state.writes = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("loadReputationStats", () => {
  it("counts gold passes/fails from code reviews and one outcome per non-gold task", async () => {
    state.submissions = [
      sub("s1", "g1", 1, true, "accepted"),
      sub("s2", "g2", 1, true, "needs_revision"),
      sub("s3", "t1", 2, false, "paid"),
      sub("s4", "t1", 1, false, "paid"), // older version of the same task: counted once
      sub("s5", "t2", 1, false, "rejected"),
      sub("s6", "t3", 1, false, "needs_revision"),
      sub("s7", "t4", 1, false, "submitted"), // still in review: not counted
    ];
    state.reviews = [
      { submission_id: "s1", reason_code: "ACCEPTED" },
      { submission_id: "s2", reason_code: "GOLD_FAIL" },
    ];
    expect(await loadReputationStats("u1")).toEqual({
      goldPassed: 1,
      goldFailed: 1,
      accepted: 1,
      rejected: 1,
      revised: 1,
    });
  });
});

describe("getContributorReputation", () => {
  it("a new account with no history is New and gated", async () => {
    const r = await getContributorReputation("u1", ENV);
    expect(r).toMatchObject({ tier: "new", gating: true, tier_floor: null });
    expect(state.writes[0]).toMatchObject({ op: "insert", user_id: "u1", tier: "new" });
  });

  it("a grandfathered contributor keeps Trusted access through the floor", async () => {
    state.profile = { tier_floor: "trusted" };
    const r = await getContributorReputation("u1", ENV);
    expect(r).toMatchObject({ tier: "trusted", earned_tier: "new", gating: true });
    expect(state.writes[0]).toMatchObject({ op: "update", tier: "trusted" });
  });

  it("disables gating (never locks people out) when migration 012 is not applied", async () => {
    state.profileError = { message: 'column "tier_floor" does not exist' };
    const r = await getContributorReputation("u1", ENV);
    expect(r.gating).toBe(false);
    expect(state.writes).toHaveLength(0);
  });

  it("reports gating off when REPUTATION_GATING=off", async () => {
    const r = await getContributorReputation("u1", { ...ENV, REPUTATION_GATING: "off" } as Env);
    expect(r.gating).toBe(false);
  });
});
