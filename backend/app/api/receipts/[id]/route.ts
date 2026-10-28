/**
 * GET /api/receipts/{id} – minimal public payout receipt (no auth).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { getPublicReceipt } from "@/lib/settlement/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const { id } = await params;
      return ok(await getPublicReceipt(id));
    }),
  );
}