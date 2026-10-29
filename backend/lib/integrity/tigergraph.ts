/**
 * TigerGraph engine for integrity checks (HHG F6.2).
 *
 * Upserts the integrity graph (see /tigergraph/schema.gsql) through REST++ and
 * runs the installed link queries (/tigergraph/queries.gsql). The links feed
 * the same `detectIntegrityFlags` derivation as the in-process engine, so both
 * produce identical flags for identical data.
 *
 * Selected only when TIGERGRAPH_HOST and TIGERGRAPH_TOKEN are set; otherwise
 * the in-process engine runs. Plain fetch, no SDK dependency.
 */

import type { Env } from "@/lib/env";
import type { AccountLink, IntegrityInput } from "@/lib/integrity/graph";

export interface TigerGraphConfig {
  host: string;
  graph: string;
  token: string;
}

export function tigerGraphConfig(env: Env): TigerGraphConfig | null {
  const host = (env.TIGERGRAPH_HOST ?? "").trim().replace(/\/+$/, "");
  const token = (env.TIGERGRAPH_TOKEN ?? "").trim();
  if (!host || !token) return null;
  return { host, token, graph: (env.TIGERGRAPH_GRAPH ?? "Zeno").trim() || "Zeno" };
}

type Attr = Record<string, { value: string | boolean }>;
type Vertices = Record<string, Record<string, Attr>>;
type Edges = Record<string, Record<string, Record<string, Record<string, Record<string, Attr>>>>>;

const norm = (wallet: string | null | undefined) => {
  const w = (wallet ?? "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(w) ? w : null;
};

/** Build the REST++ upsert body for the whole integrity graph. */
export function buildUpsertPayload(input: IntegrityInput): { vertices: Vertices; edges: Edges } {
  const vertices: Vertices = { Account: {}, Wallet: {}, Job: {}, Asset: {}, Submission: {} };
  const edges: Edges = { Account: {}, Submission: {} };
  const edge = (fromType: string, fromId: string, type: string, toType: string, toId: string, attrs: Attr = {}) => {
    const byFrom = (edges[fromType][fromId] ??= {});
    const byType = (byFrom[type] ??= {});
    const byToType = (byType[toType] ??= {});
    byToType[toId] = attrs;
  };

  for (const a of input.accounts) {
    vertices.Account[a.id] = {};
    const wallet = norm(a.wallet_address);
    if (wallet) {
      vertices.Wallet[wallet] = {};
      edge("Account", a.id, "USES_WALLET", "Wallet", wallet, { how: { value: "payout wallet" } });
    }
  }
  for (const j of input.jobs) {
    vertices.Job[j.id] = {};
    vertices.Account[j.buyer_id] ??= {};
    edge("Account", j.buyer_id, "OWNS_JOB", "Job", j.id);
    const wallet = norm(j.funding_wallet_address);
    if (wallet) {
      vertices.Wallet[wallet] = {};
      edge("Account", j.buyer_id, "USES_WALLET", "Wallet", wallet, { how: { value: `funded job ${j.id}` } });
    }
  }
  for (const s of input.submissions) {
    vertices.Submission[s.id] = {
      content_hash: { value: s.content_hash },
      has_content: { value: s.has_content },
      status: { value: s.status },
    };
    vertices.Asset[s.asset_id] = {};
    vertices.Account[s.contributor_id] ??= {};
    edge("Account", s.contributor_id, "SUBMITTED", "Submission", s.id);
    edge("Submission", s.id, "ON_ASSET", "Asset", s.asset_id);
    edge("Submission", s.id, "FOR_JOB", "Job", s.job_id);
  }
  for (const r of input.reviews) {
    vertices.Account[r.reviewer_id] ??= {};
    edge("Account", r.reviewer_id, "REVIEWED", "Submission", r.submission_id);
  }
  return { vertices, edges };
}

/** Parse the two installed queries' outputs into links. */
export function parseLinkResults(
  walletResult: unknown,
  duplicateResult: unknown,
): AccountLink[] {
  const first = (value: unknown, key: string): Record<string, string>[] => {
    const results = (value as { results?: Record<string, unknown>[] } | null)?.results ?? [];
    for (const r of results) if (Array.isArray(r[key])) return r[key] as Record<string, string>[];
    return [];
  };
  const links: AccountLink[] = [];
  for (const l of first(walletResult, "links")) {
    links.push({
      a: l.a,
      b: l.b,
      signal: "wallet_link",
      evidence: { wallet: l.wallet, this_account: l.how_a, other_account: l.how_b },
    });
  }
  for (const d of first(duplicateResult, "dups")) {
    links.push({
      a: d.a,
      b: d.b,
      signal: "duplicate_work",
      evidence: { asset_id: d.asset, this_submission: d.sa, other_submission: d.sb },
    });
  }
  return links;
}

/** Sync the graph to TigerGraph and return the links its queries find. */
export async function tigerGraphLinks(
  config: TigerGraphConfig,
  input: IntegrityInput,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountLink[]> {
  const headers = { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" };
  const call = async (path: string, init: RequestInit) => {
    const response = await fetchImpl(`${config.host}${path}`, { ...init, headers });
    const text = await response.text();
    if (!response.ok) throw new Error(`TigerGraph ${path} failed: ${response.status} ${text.slice(0, 200)}`);
    const body = JSON.parse(text) as { error?: boolean; message?: string };
    if (body.error) throw new Error(`TigerGraph ${path} error: ${body.message ?? "unknown"}`);
    return body;
  };

  const graph = encodeURIComponent(config.graph);
  await call(`/restpp/graph/${graph}`, { method: "POST", body: JSON.stringify(buildUpsertPayload(input)) });
  const wallets = await call(`/restpp/query/${graph}/zeno_wallet_links`, { method: "GET" });
  const duplicates = await call(`/restpp/query/${graph}/zeno_duplicate_work`, { method: "GET" });
  return parseLinkResults(wallets, duplicates);
}
