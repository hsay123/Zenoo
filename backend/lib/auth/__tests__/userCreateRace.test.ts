/**
 * Regression: concurrent first logins for the same Privy DID must not fail
 * with a `users_privy_did_key` duplicate-key error.
 *
 * Seen on the real backend: on a fresh login the browser fires more than one
 * `/api/me`, both SELECT-miss the (still-absent) `users` row, and both INSERT
 * — the loser hit the unique constraint and the session failed. The fix makes
 * the loser back off and read the winner's row.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadOrCreateUserByPrivyDid, type PrivyClaims } from "../verifyToken";

const DID = "did:privy:cmrace0000000000000000000";

const state = vi.hoisted(() => ({
  store: [] as Array<Record<string, unknown>>,
  // Number of SELECTs that should still miss (simulates the race window).
  selectMisses: 0,
}));

vi.mock("@/lib/db/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table !== "users") throw new Error(`unexpected table: ${table}`);
      return {
        // SELECT path: from("users").select("*").eq("privy_did", d).maybeSingle()
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (state.selectMisses > 0) {
                state.selectMisses -= 1;
                return { data: null, error: null };
              }
              return { data: state.store[0] ?? null, error: null };
            },
          }),
        }),
        // INSERT path: from("users").insert(v).select("*").single()
        insert: (values: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (state.store.length > 0) {
                return {
                  data: null,
                  error: {
                    message:
                      'duplicate key value violates unique constraint "users_privy_did_key"',
                  },
                };
              }
              const row = { id: "row-1", ...values };
              state.store.push(row);
              return { data: row, error: null };
            },
          }),
        }),
      };
    },
  }),
}));

const claims: PrivyClaims = {
  privyDid: DID,
  walletAddress: "0x1111111111111111111111111111111111111111",
  email: "race@example.com",
};

describe("loadOrCreateUserByPrivyDid", () => {
  beforeEach(() => {
    state.store = [];
    state.selectMisses = 0;
  });

  it("creates the user on first login", async () => {
    const user = await loadOrCreateUserByPrivyDid(claims);
    expect(user.id).toBe("row-1");
    expect(user.privy_did).toBe(DID);
    expect(state.store).toHaveLength(1);
  });

  it("re-reads the winner row when a concurrent first login wins the INSERT race", async () => {
    // The winner already committed (row exists) but the loser's SELECT ran
    // before the commit, so the loser's INSERT collides with
    // users_privy_did_key. The fallback SELECT must find the winner.
    state.store = [
      { id: "row-1", privy_did: DID, role: "contributor", status: "active" },
    ];
    state.selectMisses = 1; // only the first SELECT misses
    const user = await loadOrCreateUserByPrivyDid(claims);
    expect(user.id).toBe("row-1");
  });

  it("rethrows the duplicate-key error when even the fallback finds nothing", async () => {
    state.store = [{ id: "row-1", privy_did: DID }]; // INSERT will collide
    state.selectMisses = 2; // both SELECTs miss
    await expect(loadOrCreateUserByPrivyDid(claims)).rejects.toThrow(
      /Failed to create user: duplicate key/,
    );
  });
});