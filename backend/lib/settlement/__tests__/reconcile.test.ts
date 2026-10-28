/**
 * reconcileSettlements tests.
 *
 * The crash-recovery path must re-verify a broadcast settlement against the
 * contributor's *real* payout address. Passing `null` (the old behaviour) can
 * never match the on-chain `TaskSettled.payee`, so a genuine payout was stuck
 * unresolved forever. Verification here returns null on purpose so the row is
 * reported unresolved without needing to mock the full finalise path.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  reconcileSettlements,
  type SettlementRequest,
  type SettlementService,
} from "../service";

const PAYEE = "0x1111111111111111111111111111111111111111";

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  wallets: {} as Record<string, string | null>,
}));

vi.mock("@/lib/db/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const builder: {
        filter?: { col: string; value: unknown };
        select: () => unknown;
        eq: (col: string, value: unknown) => unknown;
        in: () => unknown;
        order: () => Promise<{ data: unknown; error: null }>;
        maybeSingle: () => Promise<{ data: unknown; error: null }>;
      } = {
        select: () => builder,
        eq: (col: string, value: unknown) => {
          builder.filter = { col, value };
          return builder;
        },
        in: () => builder,
        order: async () => ({ data: table === "settlements" ? h.rows : [], error: null }),
        maybeSingle: async () =>
          table === "users"
            ? {
                data: { wallet_address: h.wallets[builder.filter?.value as string] ?? null },
                error: null,
              }
            : { data: null, error: null },
      };
      return builder;
    },
  }),
}));

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    task_id: "t1",
    submission_id: "sub1",
    job_id: "j1",
    contributor_id: "u1",
    status: "submitted",
    tx_hash: `0x${"ab".repeat(32)}`,
    is_mock: false,
    amount: "0.25",
    annotation_hash: `0x${"cd".repeat(32)}`,
    policy_hash: null,
    review_ref: null,
    receipt_id: null,
    error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function recordingService(seen: SettlementRequest[]): SettlementService {
  return {
    settle: async () => {
      throw new Error("settle must not be called during reconciliation");
    },
    verify: async (req) => {
      seen.push(req);
      return null;
    },
  };
}

beforeEach(() => {
  h.rows = [];
  h.wallets = {};
});

describe("reconcileSettlements", () => {
  it("re-verifies against the contributor's wallet address, never null", async () => {
    h.rows = [row()];
    h.wallets = { u1: PAYEE };
    const seen: SettlementRequest[] = [];

    const result = await reconcileSettlements(recordingService(seen));

    expect(seen).toHaveLength(1);
    expect(seen[0].payeeAddress).toBe(PAYEE);
    expect(seen[0].taskId).toBe("t1");
    expect(result.finalized).toEqual([]);
    expect(result.unresolved.map((r) => r.id)).toEqual(["s1"]);
  });

  it("leaves a settlement unresolved when the contributor has no wallet", async () => {
    h.rows = [row()];
    h.wallets = { u1: null };
    const seen: SettlementRequest[] = [];

    const result = await reconcileSettlements(recordingService(seen));

    expect(seen[0].payeeAddress).toBeNull();
    expect(result.unresolved).toHaveLength(1);
  });

  it("does not verify a row that was never broadcast", async () => {
    h.rows = [row({ tx_hash: null })];
    h.wallets = { u1: PAYEE };
    const seen: SettlementRequest[] = [];

    const result = await reconcileSettlements(recordingService(seen));

    expect(seen).toHaveLength(0);
    expect(result.unresolved.map((r) => r.id)).toEqual(["s1"]);
  });
});
