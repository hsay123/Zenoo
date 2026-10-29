/**
 * GET /api/tasks/locked – paid work the caller's tier cannot claim yet
 * (contributor only), so the task list can say what exists and how to unlock
 * it instead of hiding it. Read-only and additive: claiming stays gated by
 * `claimBlockReason` exactly as before.
 *
 * Returns the tier, what the next tier needs, and one row per funded job with
 * open tasks that are locked (paid work for New; video below Trusted).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { getEnv } from "@/lib/env";
import { claimBlockReason } from "@/lib/reputation/score";
import { getContributorReputation } from "@/lib/reputation/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "contributor");
      const reputation = await getContributorReputation(user.id, getEnv());
      const base = { tier: reputation.tier, next: reputation.next, gating: reputation.gating };
      if (!reputation.gating) return ok({ ...base, locked: [] });

      const supabase = getSupabase();
      const { data: jobs, error } = await supabase
        .from("jobs")
        .select("id, title, modality, reward_per_task, label_list")
        .eq("status", "published")
        .eq("funding_status", "funded")
        .eq("is_demo", false);
      if (error) throw HttpError.internal(`Failed to load jobs: ${error.message}`);

      // One query for every open, non-gold task of those jobs, grouped here.
      const lockedJobs = (jobs ?? []).filter((job) =>
        claimBlockReason(reputation.tier, { is_gold: false, modality: job.modality as "image" | "video" }),
      );
      const counts = new Map<string, number>();
      if (lockedJobs.length > 0) {
        const { data: open, error: openError } = await supabase
          .from("tasks")
          .select("job_id")
          .eq("status", "available")
          .eq("is_gold", false)
          .eq("is_demo", false)
          .in("job_id", lockedJobs.map((job) => job.id as string))
          .limit(5000);
        if (openError) throw HttpError.internal(`Failed to count open tasks: ${openError.message}`);
        for (const row of open ?? []) counts.set(row.job_id as string, (counts.get(row.job_id as string) ?? 0) + 1);
      }
      const locked = lockedJobs
        .filter((job) => counts.get(job.id as string))
        .map((job) => ({
          job_id: job.id as string,
          title: job.title as string,
          modality: job.modality as string,
          reward_per_task: String(job.reward_per_task),
          labels: (job.label_list as string[]) ?? [],
          open_tasks: counts.get(job.id as string) ?? 0,
          reason: claimBlockReason(reputation.tier, { is_gold: false, modality: job.modality as "image" | "video" })!,
          unlocks_at: job.modality === "video" ? "trusted" : "verified",
        }));
      locked.sort((a, b) => b.open_tasks - a.open_tasks);
      return ok({ ...base, locked: locked.slice(0, 20) });
    }),
  );
}
