/**
 * Integrity checks (HHG F6.2): load the account graph from Postgres, find
 * links with TigerGraph (when configured) or the in-process engine, derive
 * flags, and store them in `account_flags` (migration 013).
 *
 * Flags only ever add caution: an open flag sends that account's submissions
 * to a human reviewer and stops a linked reviewer from deciding the linked
 * account's work. They never block payouts or change roles by themselves.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { Env } from "@/lib/env";
import { hashCanonicalJson } from "@/lib/hash";
import { emitZenoEvent } from "@/lib/notify/viasocket";
import {
  detectIntegrityFlags,
  findLinks,
  type IntegrityFlag,
  type IntegrityInput,
} from "@/lib/integrity/graph";
import { tigerGraphConfig, tigerGraphLinks } from "@/lib/integrity/tigergraph";

/** Hash of the label content only, so identical labels match across tasks. */
export function contentFingerprint(payload: unknown): { hash: string; hasContent: boolean } {
  const { task_id: _t, asset_id: _a, ...content } = (payload ?? {}) as Record<string, unknown>;
  void _t;
  void _a;
  const boxes = Array.isArray(content.boxes) ? content.boxes.length : 0;
  const segments = Array.isArray(content.segments) ? content.segments.length : 0;
  return { hash: hashCanonicalJson(content), hasContent: boxes + segments > 0 };
}

export async function loadIntegrityInput(): Promise<IntegrityInput> {
  const supabase = getSupabase();
  const [users, jobs, subs, reviews] = await Promise.all([
    supabase.from("users").select("id, wallet_address"),
    supabase.from("jobs").select("id, funding_wallet_address, project:projects!inner(buyer_id)"),
    supabase
      .from("submissions")
      .select("id, contributor_id, task_id, version, payload, task:tasks!inner(asset_id, job_id, status)")
      .order("version", { ascending: false }),
    supabase.from("reviews").select("submission_id, reviewer_id").eq("reviewer_type", "human"),
  ]);
  for (const r of [users, jobs, subs, reviews]) {
    if (r.error) throw HttpError.internal(`Failed to load integrity data: ${r.error.message}`);
  }

  const latest = new Map<string, IntegrityInput["submissions"][number]>();
  for (const raw of subs.data ?? []) {
    const row = raw as unknown as {
      id: string;
      contributor_id: string;
      task_id: string;
      payload: unknown;
      task: { asset_id: string; job_id: string; status: string };
    };
    const key = `${row.contributor_id}|${row.task_id}`;
    if (latest.has(key)) continue; // ordered by version desc: first is latest
    const { hash, hasContent } = contentFingerprint(row.payload);
    latest.set(key, {
      id: row.id,
      contributor_id: row.contributor_id,
      task_id: row.task_id,
      asset_id: row.task.asset_id,
      job_id: row.task.job_id,
      content_hash: hash,
      has_content: hasContent,
      status: row.task.status,
    });
  }

  return {
    accounts: (users.data ?? []).map((u) => ({
      id: u.id as string,
      wallet_address: (u.wallet_address as string | null) ?? null,
    })),
    jobs: (jobs.data ?? []).map((raw) => {
      const j = raw as unknown as {
        id: string;
        funding_wallet_address: string | null;
        project: { buyer_id: string };
      };
      return { id: j.id, buyer_id: j.project.buyer_id, funding_wallet_address: j.funding_wallet_address };
    }),
    submissions: [...latest.values()],
    reviews: (reviews.data ?? [])
      .filter((r) => r.reviewer_id)
      .map((r) => ({ submission_id: r.submission_id as string, reviewer_id: r.reviewer_id as string })),
  };
}

export interface IntegrityRunResult {
  engine: "tigergraph" | "local";
  accounts: number;
  submissions: number;
  flags: number;
  by_signal: Record<string, number>;
}

/** Run a full check and store the flags (new ones open; existing keep their status). */
export async function runIntegrityCheck(
  env: Env,
  deps: {
    load?: () => Promise<IntegrityInput>;
    links?: typeof tigerGraphLinks;
  } = {},
): Promise<IntegrityRunResult> {
  const input = await (deps.load ?? loadIntegrityInput)();
  const tg = tigerGraphConfig(env);
  const engine = tg ? "tigergraph" : "local";
  const links = tg ? await (deps.links ?? tigerGraphLinks)(tg, input) : findLinks(input);
  const flags = detectIntegrityFlags(input, links);

  if (flags.length > 0) {
    const rows = flags.map((f: IntegrityFlag) => ({
      user_id: f.user_id,
      related_user_id: f.related_user_id,
      pair_key: f.related_user_id ?? "self",
      signal: f.signal,
      evidence: f.evidence,
      source: engine,
    }));
    // No `status` in the rows: inserts default to 'open', and an update
    // refreshes evidence without undoing an admin's confirm/clear.
    const { error } = await getSupabase()
      .from("account_flags")
      .upsert(rows, { onConflict: "user_id,signal,pair_key" });
    if (error) throw HttpError.internal(`Failed to store integrity flags: ${error.message}`);
  }

  const by_signal: Record<string, number> = {};
  for (const f of flags) by_signal[f.signal] = (by_signal[f.signal] ?? 0) + 1;
  if (flags.length > 0) {
    emitZenoEvent("integrity.flagged", {
      engine,
      flags: flags.length,
      ...by_signal,
    });
  }
  return {
    engine,
    accounts: input.accounts.length,
    submissions: input.submissions.length,
    flags: flags.length,
    by_signal,
  };
}

/**
 * Open flags touching an account (as subject). Returns [] if migration 013 is
 * not applied, so a missing table never blocks submissions or reviews.
 */
export async function openFlagsFor(userId: string): Promise<{ signal: string; related_user_id: string | null }[]> {
  const { data, error } = await getSupabase()
    .from("account_flags")
    .select("signal, related_user_id")
    .eq("user_id", userId)
    .eq("status", "open");
  if (error) return [];
  return (data ?? []) as { signal: string; related_user_id: string | null }[];
}

/** True when an open flag links these two accounts (either direction). */
export async function accountsLinked(a: string, b: string): Promise<boolean> {
  const [fromA, fromB] = await Promise.all([openFlagsFor(a), openFlagsFor(b)]);
  return fromA.some((f) => f.related_user_id === b) || fromB.some((f) => f.related_user_id === a);
}
