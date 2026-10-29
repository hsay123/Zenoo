/**
 * TigerGraph adapter tests (fake fetch — no live TigerGraph needed) plus the
 * engine-equivalence check: links parsed from TigerGraph's query output yield
 * exactly the same flags as the in-process engine.
 */

import { describe, expect, it } from "vitest";
import { detectIntegrityFlags, findLinks, type IntegrityInput } from "../graph";
import { buildUpsertPayload, parseLinkResults, resolveToken, tigerGraphConfig, tigerGraphLinks } from "../tigergraph";
import type { Env } from "@/lib/env";

const W = "0x1111111111111111111111111111111111111111";
const input: IntegrityInput = {
  accounts: [
    { id: "buyer", wallet_address: null },
    { id: "alice", wallet_address: W },
    { id: "bob", wallet_address: null },
  ],
  jobs: [{ id: "job-1", buyer_id: "buyer", funding_wallet_address: W }],
  submissions: [
    { id: "s1", contributor_id: "alice", task_id: "t1", asset_id: "a1", job_id: "job-1", content_hash: "0xq", has_content: true, status: "accepted" },
    { id: "s2", contributor_id: "bob", task_id: "t2", asset_id: "a1", job_id: "job-1", content_hash: "0xq", has_content: true, status: "submitted" },
  ],
  reviews: [{ submission_id: "s1", reviewer_id: "rev" }],
};

/** What the installed GSQL queries would PRINT for `input`. */
function fakeQueryOutput() {
  const links = findLinks(input);
  return {
    wallets: {
      error: false,
      results: [{
        links: links.filter((l) => l.signal === "wallet_link").map((l) => ({
          a: l.a, b: l.b, wallet: l.evidence.wallet, how_a: l.evidence.this_account, how_b: l.evidence.other_account,
        })),
      }],
    },
    dups: {
      error: false,
      results: [{
        dups: links.filter((l) => l.signal === "duplicate_work").map((l) => ({
          a: l.a, b: l.b, asset: l.evidence.asset_id, sa: l.evidence.this_submission, sb: l.evidence.other_submission,
        })),
      }],
    },
  };
}

describe("tigerGraphConfig", () => {
  it("is enabled only with host and token", () => {
    expect(tigerGraphConfig({} as Env)).toBeNull();
    expect(tigerGraphConfig({ TIGERGRAPH_HOST: "https://x.tgcloud.io/", TIGERGRAPH_TOKEN: "t" } as Env)).toEqual({
      host: "https://x.tgcloud.io",
      token: "t",
      graph: "Zeno",
    });
  });
});

describe("tigerGraphConfig with a database secret", () => {
  it("prefers the secret over a token", () => {
    expect(
      tigerGraphConfig({ TIGERGRAPH_HOST: "https://x", TIGERGRAPH_SECRET: "s", TIGERGRAPH_TOKEN: "t" } as Env),
    ).toEqual({ host: "https://x", graph: "Zeno", secret: "s" });
  });
});

describe("resolveToken", () => {
  it("exchanges the secret for a token via POST /gsql/v1/tokens", async () => {
    let seen: { url: string; body: unknown } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ error: false, token: "tok-123" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await resolveToken({ host: "https://tg", graph: "Zeno", secret: "sec" }, fakeFetch)).toBe("tok-123");
    expect(seen).toEqual({
      url: "https://tg/gsql/v1/tokens",
      body: { secret: "sec", graph: "Zeno", lifetime: "3600" },
    });
  });

  it("uses a configured token without calling the server", async () => {
    const never = (async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    expect(await resolveToken({ host: "https://tg", graph: "Zeno", token: "t" }, never)).toBe("t");
  });

  it("reports a rejected secret without echoing it", async () => {
    const reject = (async () =>
      new Response(JSON.stringify({ error: true, message: "invalid secret" }), { status: 401 })) as unknown as typeof fetch;
    const err = await resolveToken({ host: "https://tg", graph: "Zeno", secret: "TOP-SECRET" }, reject).catch((e) => e);
    expect(String(err.message)).toMatch(/invalid secret/);
    expect(String(err.message)).not.toContain("TOP-SECRET");
  });
});

describe("buildUpsertPayload", () => {
  it("creates the vertices and edges the GSQL schema defines", () => {
    const p = buildUpsertPayload(input);
    expect(Object.keys(p.vertices.ZenoAccount).sort()).toEqual(["alice", "bob", "buyer", "rev"]);
    expect(p.vertices.ZenoWallet).toEqual({ [W]: {} });
    expect(p.vertices.ZenoSubmission.s1).toEqual({
      content_hash: { value: "0xq" },
      has_content: { value: true },
      status: { value: "accepted" },
    });
    expect(p.edges.ZenoAccount.alice.ZENO_USES_WALLET.ZenoWallet[W]).toEqual({ how: { value: "payout wallet" } });
    expect(p.edges.ZenoAccount.buyer.ZENO_USES_WALLET.ZenoWallet[W]).toEqual({ how: { value: "funded job job-1" } });
    expect(p.edges.ZenoAccount.buyer.ZENO_OWNS_JOB.ZenoJob["job-1"]).toEqual({});
    expect(p.edges.ZenoSubmission.s2.ZENO_ON_ASSET.ZenoAsset.a1).toEqual({});
    expect(p.edges.ZenoAccount.rev.ZENO_REVIEWED.ZenoSubmission.s1).toEqual({});
  });
});

describe("tigerGraphLinks", () => {
  it("upserts the graph, runs both installed queries, and parses their links", async () => {
    const out = fakeQueryOutput();
    const calls: { url: string; method?: string; auth?: string }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, auth: (init.headers as Record<string, string>).Authorization });
      const body = url.endsWith("/restpp/graph/Zeno")
        ? { error: false, results: [{ accepted_vertices: 9, accepted_edges: 10 }] }
        : url.includes("zeno_wallet_links") ? out.wallets : out.dups;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const links = await tigerGraphLinks({ host: "https://tg", graph: "Zeno", token: "tok" }, input, fakeFetch);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://tg/restpp/graph/Zeno",
      "GET https://tg/restpp/query/Zeno/zeno_wallet_links",
      "GET https://tg/restpp/query/Zeno/zeno_duplicate_work",
    ]);
    expect(calls.every((c) => c.auth === "Bearer tok")).toBe(true);
    expect(links).toHaveLength(findLinks(input).length);
  });

  it("surfaces TigerGraph errors instead of reporting no flags", async () => {
    const failing = (async () => new Response(JSON.stringify({ error: true, message: "query not installed" }), { status: 200 })) as unknown as typeof fetch;
    await expect(tigerGraphLinks({ host: "https://tg", graph: "Zeno", token: "t" }, input, failing)).rejects.toThrow(/not installed/);
  });
});

describe("engine equivalence", () => {
  it("TigerGraph links produce exactly the same flags as the local engine", () => {
    const out = fakeQueryOutput();
    const fromTigerGraph = detectIntegrityFlags(input, parseLinkResults(out.wallets, out.dups));
    const local = detectIntegrityFlags(input);
    const key = (f: { user_id: string; signal: string; related_user_id: string | null }) =>
      `${f.user_id}|${f.signal}|${f.related_user_id}`;
    expect(fromTigerGraph.map(key).sort()).toEqual(local.map(key).sort());
    // And the scenario is caught: alice's wallet funded buyer's job, she labelled it.
    expect(local.map(key)).toContain("alice|self_dealing|buyer");
  });
});
