import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { PlatformClient, earningsSummarySchema } from "./platform";

const userSchema = z.object({ id: z.string(), role: z.string() });

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Regression for the email-login failure:
 *   NETWORK — Failed to execute 'fetch' on 'Window': Illegal invocation
 *
 * The browser's `fetch` throws when called with a receiver other than
 * `window`. `PlatformClient` stores a reference and calls it as a method
 * (`this.fetchImpl(...)`), so the reference MUST be bound first. Node's own
 * `fetch` tolerates an arbitrary receiver, so this test installs a
 * brand-checking global fetch that reproduces the browser behaviour.
 */
describe("PlatformClient — fetch binding", () => {
  it("does not rebind `this` when calling the global fetch", async () => {
    const receivers: unknown[] = [];
    function brandCheckedFetch(this: unknown) {
      receivers.push(this);
      if (this !== undefined && this !== globalThis) {
        throw new TypeError(
          "Failed to execute 'fetch' on 'Window': Illegal invocation",
        );
      }
      return Promise.resolve(jsonResponse({ id: "u1", role: "buyer" }));
    }
    globalThis.fetch = brandCheckedFetch as unknown as typeof fetch;

    const client = new PlatformClient({ baseUrl: "https://api.example" });
    const user = await client.get(userSchema, "/api/me");

    expect(user).toEqual({ id: "u1", role: "buyer" });
    expect(receivers[0]).toBe(globalThis);
  });

  it("still honours an injected fetch implementation", async () => {
    let called = false;
    const client = new PlatformClient({
      baseUrl: "https://api.example/",
      fetchImpl: async () => {
        called = true;
        return jsonResponse({ id: "u2", role: "admin" });
      },
    });

    await expect(client.get(userSchema, "/api/me")).resolves.toEqual({
      id: "u2",
      role: "admin",
    });
    expect(called).toBe(true);
  });
});

describe("PlatformClient — auth and envelope", () => {
  it("sends the bearer token and parses the { data } envelope", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const client = new PlatformClient({
      baseUrl: "https://api.example",
      getToken: () => "tok-123",
      fetchImpl: async (input, init) => {
        seen.push({
          url: String(input),
          auth: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse({ id: "u3", role: "reviewer" });
      },
    });

    await client.get(userSchema, "/api/me");
    expect(seen[0]).toEqual({
      url: "https://api.example/api/me",
      auth: "Bearer tok-123",
    });
  });

  it("maps a 401 response to a UNAUTHORIZED PlatformError", async () => {
    const client = new PlatformClient({
      baseUrl: "https://api.example",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "nope" } }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    });

    await expect(client.get(userSchema, "/api/me")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

/**
 * S5 regression: an earnings row now carries the payout receipt id and an
 * explicit mock flag, so a mocked payout can be labelled honestly rather than
 * inferred from the presence of a transaction hash.
 */
describe("earningsSummarySchema", () => {
  it("parses a settled row that carries a mock receipt", () => {
    const parsed = earningsSummarySchema.parse({
      total_accepted: 1,
      total_paid: "6",
      total_pending: "0",
      tasks: [
        {
          task_id: "t1",
          submission_id: "s1",
          job_title: "Job",
          status: "paid",
          reward: "6",
          submitted_at: "2026-01-01T00:00:00Z",
          receipt_id: "r1",
          settlement_is_mock: true,
          tx_hash: "0xabc",
        },
      ],
    });
    expect(parsed.tasks[0].receipt_id).toBe("r1");
    expect(parsed.tasks[0].settlement_is_mock).toBe(true);
  });

  it("parses an unsettled row with no receipt", () => {
    const parsed = earningsSummarySchema.parse({
      total_accepted: 1,
      total_paid: "0",
      total_pending: "6",
      tasks: [
        {
          task_id: "t1",
          submission_id: "s1",
          job_title: "Job",
          status: "accepted",
          reward: "6",
          submitted_at: "2026-01-01T00:00:00Z",
          receipt_id: null,
          settlement_is_mock: null,
          tx_hash: null,
        },
      ],
    });
    expect(parsed.tasks[0].receipt_id).toBeNull();
    expect(parsed.tasks[0].settlement_is_mock).toBeNull();
  });
});
