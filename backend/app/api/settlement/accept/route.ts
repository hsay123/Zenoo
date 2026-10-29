/**
 * POST /api/settlement/accept – settle an accepted task (admin).
 *
 * Idempotent (Idempotency-Key header) and rate-limited (mock future: one
 * settlement per task, enforced by the task state machine).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { withIdempotency } from "@/lib/idempotency";
import { settlementAcceptSchema } from "@/lib/validation/settlement";
import { settleAcceptedTask } from "@/lib/settlement/service";

// Real settlement waits for a Base Sepolia receipt, which can exceed the
// platform default function timeout (10s on Vercel Hobby). 30s is plenty for
// a ~0.5s block time plus RPC latency.
export const maxDuration = 30;

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const admin = await requireRole(req, "admin");
      const body = settlementAcceptSchema.parse(await readJson(req));

      const receipt = await withIdempotency({
        endpoint: "POST /api/settlement/accept",
        userId: admin.id,
        rawKey: req.headers.get("idempotency-key"),
        action: () =>
          settleAcceptedTask({
            taskId: body.task_id,
            submissionId: body.submission_id,
          }),
      });

      return ok(receipt);
    }),
  );
}