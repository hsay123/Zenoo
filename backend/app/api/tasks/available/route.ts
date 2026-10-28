/**
 * GET /api/tasks/available – list claimable tasks (contributor only).
 *
 * Side effect: expired leases are released before the listing is produced.
 * `gold_answer` is never selected (see TASK_PUBLIC_COLUMNS).
 * Only tasks from funded, non-demo jobs are shown, filtered by the caller's
 * reputation tier (New: gold tasks only; video needs Trusted).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { paginated, parsePagination } from "@/lib/api/pagination";
import { requireRole } from "@/lib/auth/requireRole";
import { releaseExpiredLeases } from "@/lib/tasks/leases";
import { TASK_PUBLIC_COLUMNS, toTask, type TaskRow } from "@/lib/tasks/repository";
import { getSupabase } from "@/lib/db/supabase";
import {
  listAvailableTasksQuerySchema,
  searchParamsToRecord,
} from "@/lib/validation/jobs";
import type { Task } from "@/src/types/api";
import { getEnv } from "@/lib/env";
import { accessForTier } from "@/lib/reputation/score";
import { getContributorReputation } from "@/lib/reputation/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "contributor");

      const filters = listAvailableTasksQuerySchema.parse(
        searchParamsToRecord(req.nextUrl.searchParams),
      );
      const page = parsePagination(req.nextUrl.searchParams);

      // Release stale leases so those tasks reappear as available.
      await releaseExpiredLeases();

      const supabase = getSupabase();

      // Only tasks whose parent job is published AND funded AND not demo are claimable.
      let jobQuery = supabase
        .from("jobs")
        .select("id")
        .eq("status", "published")
        .eq("funding_status", "funded")
        .eq("is_demo", false);
      if (filters.job_id) jobQuery = jobQuery.eq("id", filters.job_id);
      const { data: jobs, error: jobsError } = await jobQuery;
      if (jobsError) {
        throw HttpError.internal(`Failed to load published jobs: ${jobsError.message}`);
      }

      const jobIds = (jobs ?? []).map((j) => j.id as string);
      if (jobIds.length === 0) {
        return ok(paginated<Task>([], 0, page));
      }

      let query = supabase
        .from("tasks")
        .select(TASK_PUBLIC_COLUMNS, { count: "exact" })
        .eq("status", "available")
        .eq("is_demo", false)
        .in("job_id", jobIds)
        .order("created_at", { ascending: true })
        .range(page.from, page.to);

      if (filters.modality) query = query.eq("modality", filters.modality);

      // Reputation gating (HHG F4): New contributors see gold (qualification)
      // tasks only; video needs Trusted. Enforced again at claim time.
      const reputation = await getContributorReputation(user.id, getEnv());
      if (reputation.gating) {
        const access = accessForTier(reputation.tier);
        if (access.goldOnly) query = query.eq("is_gold", true);
        if (!access.video) query = query.neq("modality", "video");
      }

      const { data, error, count } = await query;
      if (error) throw HttpError.internal(`Failed to list tasks: ${error.message}`);

      const items = (data ?? []).map((row) => toTask(row as TaskRow));
      return ok(paginated(items, count ?? items.length, page));
    }),
  );
}
