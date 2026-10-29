/**
 * Proves the API layer delegates onboarding to exactly one transactional RPC
 * call and never performs the old multi-step (insert org -> insert member ->
 * update user) sequence itself.
 *
 * The mock only exposes `rpc` plus a `from()` trap: if the service ever issued
 * a per-table write again, `from()` would throw and the test would fail.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { HttpError } from "@/lib/api/errors";
import { completeOnboarding, onboardingBodySchema } from "../service";

const h = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  tables: [] as string[],
  response: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/lib/db/supabase", () => ({
  getSupabase: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.calls.push({ name, args });
      return h.response;
    },
    from: (table: string) => {
      h.tables.push(table);
      throw new Error(`unexpected per-table write: ${table}`);
    },
  }),
}));

beforeEach(() => {
  h.calls = [];
  h.tables = [];
  h.response = { data: null, error: null };
});

describe("completeOnboarding (transactional delegation)", () => {
  it("buyer: makes exactly one RPC call and no per-table writes", async () => {
    h.response = {
      data: {
        onboarding_completed: true,
        account_type: "buyer",
        organization_id: "11111111-1111-4111-8111-111111111111",
        already_completed: false,
      },
      error: null,
    };

    const choice = onboardingBodySchema.parse({
      account_type: "buyer",
      organization_name: "  Acme Robotics  ",
    });
    const result = await completeOnboarding("user-1", choice);

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].name).toBe("complete_onboarding");
    expect(h.calls[0].args).toEqual({
      p_user_id: "user-1",
      p_account_type: "buyer",
      p_org_name: "Acme Robotics",
      p_wallet_address: null,
    });
    expect(h.tables).toEqual([]);
    expect(result.organization_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("contributor: makes exactly one RPC call with a null organization", async () => {
    h.response = {
      data: {
        onboarding_completed: true,
        account_type: "contributor",
        organization_id: null,
        already_completed: false,
      },
      error: null,
    };

    const choice = onboardingBodySchema.parse({
      account_type: "contributor",
      wallet_address: "0x1111111111111111111111111111111111111111",
    });
    const result = await completeOnboarding("user-1", choice);

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].args).toEqual({
      p_user_id: "user-1",
      p_account_type: "contributor",
      p_org_name: null,
      p_wallet_address: "0x1111111111111111111111111111111111111111",
    });
    expect(h.tables).toEqual([]);
    expect(result.account_type).toBe("contributor");
  });

  it("retry on an already-onboarded user is idempotent (same single RPC)", async () => {
    h.response = {
      data: {
        onboarding_completed: true,
        account_type: "buyer",
        organization_id: "22222222-2222-4222-8222-222222222222",
        already_completed: true,
      },
      error: null,
    };
    const choice = onboardingBodySchema.parse({
      account_type: "buyer",
      organization_name: "Acme",
    });

    const first = await completeOnboarding("user-1", choice);
    const second = await completeOnboarding("user-1", choice);

    expect(h.calls).toHaveLength(2);
    expect(first.organization_id).toBe(second.organization_id);
    expect(second.already_completed).toBe(true);
    expect(h.tables).toEqual([]);
  });

  it("does not swallow RPC errors", async () => {
    h.response = { data: null, error: { code: "22023", message: "bad input" } };
    const choice = onboardingBodySchema.parse({
      account_type: "contributor",
      wallet_address: "0x1111111111111111111111111111111111111111",
    });

    await expect(completeOnboarding("user-1", choice)).rejects.toBeInstanceOf(HttpError);
    await expect(completeOnboarding("user-1", choice)).rejects.toMatchObject({
      status: 422,
      message: "bad input",
    });
  });
});
