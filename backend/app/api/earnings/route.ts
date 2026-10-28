/**
 * GET /api/earnings – contributor earnings summary.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEarningsSummary } from "@/lib/settlement/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const contributor = await requireRole(req, "contributor");
      return ok(await getEarningsSummary(contributor.id));
    }),
  );
}