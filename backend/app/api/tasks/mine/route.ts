/**
 * GET /api/tasks/mine – work the caller currently holds a lease on
 * (contributor only).
 *
 * Claiming a task removes it from the available queue, so without this the
 * contributor had no way back to a task they had already claimed (the
 * "Claiming…" row simply vanished on reload). Returns claimed and draft tasks
 * with the job title and per-task reward so the UI can offer "Continue".
 *
 * Side effect: expired leases are released first, exactly like
 * GET /api/tasks/available, so a lapsed task does not look owned forever.
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
import { getEnv } from "@/lib/env";
import { shouldHideTestJobs } from "@/lib/jobs/visibility";
import type { Task } from "@/src/types/api";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "contributor");
      const page = parsePagination(req.nextUrl.searchParams);

      await releaseExpiredLeases();

      const supabase = getSupabase();
      // Automation fixtures are not real work. Production hides them from the
      // contributor's own queue too, matching what they can claim.
      const hideTestJobs = shouldHideTestJobs(getEnv());
      let query = supabase
        .from("tasks")
        .select(TASK_PUBLIC_COLUMNS, { count: "exact" })
        .eq("lease_owner", user.id)
        .in("status", ["claimed", "draft"])
        .order("lease_expiry", { ascending: true })
        .range(page.from, page.to);
      if (hideTestJobs) query = query.eq("is_test", false);
      const { data, error, count } = await query;
      if (error) throw HttpError.internal(`Failed to list your tasks: ${error.message}`);

      const rows = (data ?? []) as TaskRow[];
      const jobIds = Array.from(new Set(rows.map((row) => row.job_id as string)));
      const jobMeta = new Map<string, Record<string, unknown>>();
      if (jobIds.length > 0) {
        const { data: jobs, error: jobError } = await supabase
          .from("jobs")
          .select("id, title, reward_per_task, label_list")
          .in("id", jobIds);
        if (jobError) {
          throw HttpError.internal(`Failed to load your tasks' jobs: ${jobError.message}`);
        }
        for (const job of jobs ?? []) jobMeta.set(job.id as string, job);
      }

      const items = rows.map((row) => {
        const job = jobMeta.get(row.job_id as string);
        return toTask({
          ...row,
          job_title: job?.title ?? null,
          reward_per_task: job?.reward_per_task ?? null,
          label_list: job?.label_list ?? null,
        });
      });
      return ok(paginated<Task>(items, count ?? items.length, page));
    }),
  );
}
