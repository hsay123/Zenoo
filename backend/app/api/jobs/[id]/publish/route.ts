/**
 * POST /api/jobs/{id}/publish – publish a draft job (owner buyer only)
 *
 * Publishing flips status `draft -> published`; tasks belonging to the job
 * become visible in GET /api/tasks/available.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { loadJobForActor, toJob, type JobRow } from "@/lib/jobs/repository";
import { getSupabase } from "@/lib/db/supabase";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const { id } = await params;

      const job = await loadJobForActor(id, user);
      if (job.status !== "draft") {
        throw HttpError.conflict(
          `Job cannot be published from status '${job.status}'`,
        );
      }

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("jobs")
        .update({ status: "published" })
        .eq("id", id)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      if (error) throw HttpError.internal(`Failed to publish job: ${error.message}`);
      if (!data) throw HttpError.conflict("Job is no longer in draft state");

      return ok(toJob(data as JobRow));
    }),
  );
}
