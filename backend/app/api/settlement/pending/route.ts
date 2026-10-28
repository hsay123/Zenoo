/**
 * GET /api/settlement/pending – incomplete settlements for operators (admin).
 *
 * Surfaces settlements that were opened but never confirmed, so an operator can
 * see money that is (or may be) in flight. A confirmed settlement never appears
 * here.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { listIncompleteSettlements } from "@/lib/settlement/repository";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      const settlements = await listIncompleteSettlements();
      return ok({ settlements });
    }),
  );
}
