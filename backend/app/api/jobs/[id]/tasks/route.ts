/**
 * POST /api/jobs/{id}/tasks – create tasks for a draft job from asset ids
 * (owner buyer or admin).
 * GET  /api/jobs/{id}/tasks – list a job's tasks (owner buyer or admin).
 *
 * Gold tasks (with a reference `gold_answer`) are admin-only: they are the
 * hidden ground truth used for contributor scoring, so a buyer must not see or
 * set them. `gold_answer` is never selected by either handler.
 */

import type { NextRequest } from "next/server";
import { created, ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { paginated, parsePagination } from "@/lib/api/pagination";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { loadJobForActor } from "@/lib/jobs/repository";
import {
  TASK_PUBLIC_COLUMNS,
  toTask,
  type TaskRow,
} from "@/lib/tasks/repository";
import { loadProjectAssets } from "@/lib/content/repository";
import { createTasksSchema } from "@/lib/validation/content";
import type { Task } from "@/src/types/api";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer", "admin");
      const { id } = await params;

      // Ownership is enforced here: a non-owner buyer or a reviewer sees 404.
      await loadJobForActor(id, user);

      const page = parsePagination(req.nextUrl.searchParams);
      const supabase = getSupabase();
      const { data, error, count } = await supabase
        .from("tasks")
        .select(TASK_PUBLIC_COLUMNS, { count: "exact" })
        .eq("job_id", id)
        .order("created_at", { ascending: true })
        .range(page.from, page.to);
      if (error) throw HttpError.internal(`Failed to list tasks: ${error.message}`);

      const items = (data ?? []).map((row) => toTask(row as TaskRow));
      return ok(paginated<Task>(items, count ?? items.length, page));
    }),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer", "admin");
      const { id } = await params;
      const input = createTasksSchema.parse(await readJson(req));

      const job = await loadJobForActor(id, user);
      if (job.status !== "draft") {
        throw HttpError.conflict(
          `Tasks can only be added to a draft job (current status '${job.status}')`,
        );
      }

      if (input.is_gold && user.role !== "admin") {
        throw HttpError.forbidden("Only an admin can create gold tasks");
      }
      if (input.is_gold && !input.gold_answer) {
        throw HttpError.unprocessable("gold_answer is required when is_gold is true", [
          { path: ["gold_answer"], message: "gold_answer is required for gold tasks" },
        ]);
      }

      const assets = await loadProjectAssets(job.project_id, input.asset_ids);
      const byId = new Map(assets.map((a) => [a.id, a]));

      const mismatched = input.asset_ids.filter(
        (assetId) => byId.get(assetId)?.modality !== job.modality,
      );
      if (mismatched.length > 0) {
        throw HttpError.unprocessable(
          `Asset modality does not match the job modality ('${job.modality}')`,
          [
            {
              path: ["asset_ids"],
              message: `mismatched asset ids: ${mismatched.join(", ")}`,
            },
          ],
        );
      }

      const rows = input.asset_ids.map((assetId) => ({
        job_id: id,
        asset_id: assetId,
        modality: job.modality,
        status: "available" as const,
        is_gold: input.is_gold,
        gold_answer: input.is_gold ? (input.gold_answer ?? null) : null,
      }));

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("tasks")
        .insert(rows)
        .select(TASK_PUBLIC_COLUMNS);
      if (error) throw HttpError.internal(`Failed to create tasks: ${error.message}`);

      const items = (data ?? []).map((row) => toTask(row as TaskRow));
      return created<Task[]>(items);
    }),
  );
}
