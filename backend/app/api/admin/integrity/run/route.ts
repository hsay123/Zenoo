/**
 * POST /api/admin/integrity/run – run a duplicate-account / integrity check
 * now (admin only). Uses TigerGraph when TIGERGRAPH_HOST + TIGERGRAPH_TOKEN
 * are set, otherwise the in-process graph engine (same rules).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { runIntegrityCheck } from "@/lib/integrity/service";

export const maxDuration = 60;

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      return ok(await runIntegrityCheck(getEnv()));
    }),
  );
}
