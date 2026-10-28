/**
 * GET /api/review/queue – submissions awaiting review (reviewer/admin).
 *
 * Lists submissions whose task status is `submitted`, oldest first, with the
 * task and job attached. `gold_answer` is never included.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { parsePagination } from "@/lib/api/pagination";
import { requireRole } from "@/lib/auth/requireRole";
import { searchParamsToRecord } from "@/lib/validation/jobs";
import { listReviewQueueQuerySchema } from "@/lib/validation/review";
import { listReviewQueue } from "@/lib/review/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "reviewer", "admin");

      const filters = listReviewQueueQuerySchema.parse(
        searchParamsToRecord(req.nextUrl.searchParams),
      );
      const page = parsePagination(req.nextUrl.searchParams);

      const result = await listReviewQueue(filters, page);
      return ok(result);
    }),
  );
}
