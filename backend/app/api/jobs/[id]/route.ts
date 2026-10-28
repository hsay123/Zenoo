/**
 * GET /api/jobs/{id} – get a single job (buyer: own; admin: any)
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { loadJobForActor } from "@/lib/jobs/repository";

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
      const job = await loadJobForActor(id, user);
      return ok(job);
    }),
  );
}
