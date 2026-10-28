/**
 * POST /api/settlement/reconcile – finalise recoverable settlements (admin).
 *
 * Re-verifies any settlement whose transaction was broadcast but not recorded
 * (e.g. a crash between broadcast and receipt), writes the missing receipt and
 * flips the task to `paid`. Anything that cannot be verified is returned as
 * unresolved rather than silently marked done.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { reconcileSettlements } from "@/lib/settlement/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      const result = await reconcileSettlements();
      return ok({
        finalized: result.finalized,
        unresolved: result.unresolved.map((row) => ({
          id: row.id,
          task_id: row.task_id,
          job_id: row.job_id,
          status: row.status,
          tx_hash: row.tx_hash,
          error: row.error,
        })),
      });
    }),
  );
}
