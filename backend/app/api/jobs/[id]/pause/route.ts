/**
 * POST /api/jobs/{id}/pause – pause a published job (owner buyer or admin).
 * A paused job takes no new claims; existing leases may still be submitted.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { loadJobForActor } from "@/lib/jobs/repository";
import { TRANSITIONS, transitionJob } from "@/lib/jobs/lifecycle";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer", "admin");
      const { id } = await params;
      const job = await loadJobForActor(id, user);
      return ok(await transitionJob(id, job, TRANSITIONS.pause, "paused"));
    }),
  );
}
