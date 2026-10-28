/**
 * GET /api/settlement/preflight – fail-closed settlement readiness (admin).
 *
 * Read-only: it inspects the configured RPC and `JobEscrow` deployment and
 * reports whether real settlement is safe to enable. It never broadcasts a
 * transaction and never reveals the signer key. When any check fails, the
 * platform stays on `MockSettlementService` (`is_mock = true`).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { runSettlementPreflight } from "@/lib/settlement/preflight";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      return ok(await runSettlementPreflight(getEnv()));
    }),
  );
}
