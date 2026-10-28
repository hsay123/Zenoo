/**
 * POST /api/payments/{id}/fund – retry escrow funding for a paid card/UPI
 * payment (admin only).
 *
 * Used when the treasury was not configured or funding failed when the
 * webhook arrived. Safe to repeat: a funding tx already broadcast is
 * re-verified on-chain, never sent twice.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { createTreasuryFunder } from "@/lib/funding/treasury";
import { fundPaidPayment } from "@/lib/funding/service";

export const maxDuration = 60;

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      const { id } = await params;
      const treasury = createTreasuryFunder(getEnv());
      if (!treasury.ok) throw HttpError.conflict(treasury.reason);
      return ok(await fundPaidPayment(id, { treasury: treasury.funder }));
    }),
  );
}
