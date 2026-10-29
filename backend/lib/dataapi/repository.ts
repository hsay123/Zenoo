/**
 * Data API data access (docs/system/DATA-API.md §2, §7).
 *
 * A dataset is one of the organisation's jobs (jobs of projects owned by the
 * organisation's members). Only accepted/paid tasks are ever read, through the
 * same record builder as the web export, so no contributor identity is loaded.
 * Pages use a keyset cursor over (tasks.updated_at, tasks.id).
 */

import { getSupabase } from "@/lib/db/supabase";
import { getEnv } from "@/lib/env";
import { HttpError } from "@/lib/api/errors";
import { buildExportRecords } from "@/lib/export/repository";
import { toJob, type JobRow } from "@/lib/jobs/repository";
import type { DataRecord } from "@/lib/dataapi/transform";
import type { Job } from "@/src/types/api";

export const ACCEPTED_STATUSES = ["accepted", "paid"] as const;
export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;
/** Signed media links handed out by the API last 15 minutes. */
export const MEDIA_URL_TTL_SECONDS = 900;

type Row = Record<string, unknown>;

async function memberIds(organizationId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);
  if (error) throw HttpError.internal(`Failed to load organization members: ${error.message}`);
  return (data ?? []).map((m) => m.user_id as string);
}

/** The organisation's jobs (newest first). Drafts are not datasets. */
export async function listOrganizationJobs(organizationId: string): Promise<Job[]> {
  const members = await memberIds(organizationId);
  if (members.length === 0) return [];
  const supabase = getSupabase();
  const { data: projects, error } = await supabase.from("projects").select("id").in("buyer_id", members);
  if (error) throw HttpError.internal(`Failed to load projects: ${error.message}`);
  const projectIds = (projects ?? []).map((p) => p.id as string);
  if (projectIds.length === 0) return [];
  const { data: jobs, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .in("project_id", projectIds)
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (jobError) throw HttpError.internal(`Failed to load jobs: ${jobError.message}`);
  return (jobs ?? []).map((row) => toJob(row as JobRow));
}

/** One of the organisation's jobs; 404 for anything else (no existence leak). */
export async function loadOrganizationJob(organizationId: string, jobId: string): Promise<Job> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw HttpError.notFound("Dataset not found");
  const jobs = await listOrganizationJobs(organizationId);
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw HttpError.notFound("Dataset not found");
  return job;
}

export async function countAccepted(jobId: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", [...ACCEPTED_STATUSES]);
  if (error) throw HttpError.internal(`Failed to count labels: ${error.message}`);
  return count ?? 0;
}

// ── Cursor ────────────────────────────────────────────────────────────────

export interface Cursor {
  u: string; // tasks.updated_at of the last record returned
  i: string; // tasks.id of the last record returned
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    if (typeof value.u === "string" && !Number.isNaN(Date.parse(value.u)) && /^[0-9a-f-]{36}$/i.test(value.i)) {
      return value;
    }
  } catch {
    // fall through
  }
  throw HttpError.unprocessable("cursor is not valid; pass next_cursor from the previous page");
}

export function parseLimit(raw: string | null): number {
  if (raw === null || raw === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw HttpError.unprocessable(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  return n;
}

export function parseSince(raw: string | null): string | null {
  if (raw === null || raw === "") return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) throw HttpError.unprocessable("since must be an ISO 8601 date-time");
  return new Date(t).toISOString();
}

// ── Pages ─────────────────────────────────────────────────────────────────

export interface LabelPage {
  records: DataRecord[];
  nextCursor: string | null;
}

export async function loadLabelPage(
  job: Job,
  opts: { cursor: Cursor | null; limit: number; since: string | null; media: boolean },
): Promise<LabelPage> {
  let query = getSupabase()
    .from("tasks")
    .select("id, asset_id, modality, updated_at")
    .eq("job_id", job.id)
    .in("status", [...ACCEPTED_STATUSES])
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(opts.limit + 1);
  if (opts.since) query = query.gt("updated_at", opts.since);
  if (opts.cursor) {
    const u = JSON.stringify(opts.cursor.u); // quoted for PostgREST's or()
    query = query.or(`updated_at.gt.${u},and(updated_at.eq.${u},id.gt.${opts.cursor.i})`);
  }
  const { data, error } = await query;
  if (error) throw HttpError.internal(`Failed to load labels: ${error.message}`);

  const rows = (data ?? []) as Row[];
  const pageRows = rows.slice(0, opts.limit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    rows.length > opts.limit && last
      ? // The raw timestamp: Postgres keeps microseconds, a JS Date only ms.
        encodeCursor({ u: last.updated_at as string, i: last.id as string })
      : null;
  if (pageRows.length === 0) return { records: [], nextCursor: null };

  const { records, objectKeyByAsset, acceptedAtByTask } = await buildExportRecords(pageRows);
  const urls = opts.media ? await signMedia([...objectKeyByAsset.values()]) : null;

  return {
    records: records.map((record) => {
      const out: DataRecord = { ...record, accepted_at: acceptedAtByTask.get(record.task_id) ?? null };
      if (urls) {
        const key = objectKeyByAsset.get(record.asset_id);
        out.media_url = (key && urls.get(key)) ?? null;
      }
      return out;
    }),
    nextCursor,
  };
}

/** One batched Storage call per page. */
async function signMedia(objectKeys: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (objectKeys.length === 0) return map;
  const { data, error } = await getSupabase()
    .storage.from(getEnv().SUPABASE_STORAGE_BUCKET)
    .createSignedUrls([...new Set(objectKeys)], MEDIA_URL_TTL_SECONDS);
  if (error) throw HttpError.internal(`Failed to sign media URLs: ${error.message}`);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}
