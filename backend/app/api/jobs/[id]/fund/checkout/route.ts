/**
 * POST /api/jobs/{id}/fund/checkout – start a card/UPI payment for a job
 * (owner buyer only) through Dodo Payments in test mode.
 *
 * Records a `job_payments` row and returns Dodo's hosted checkout URL. The job
 * is not marked as anything until Dodo's verified webhook reports the payment
 * succeeded (see /api/payments/dodo/webhook).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { loadJobForActor } from "@/lib/jobs/repository";
import { createCardCheckout } from "@/lib/funding/service";

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
      return ok(await createCardCheckout(job, user, getEnv()));
    }),
  );
}
