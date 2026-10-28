/**
 * GET /api/review/appeals/queue – open appeals for review (reviewer/admin).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { parsePagination } from "@/lib/api/pagination";
import { requireRole } from "@/lib/auth/requireRole";
import { listAppealsQueue } from "@/lib/appeals/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "reviewer", "admin");
      const page = parsePagination(req.nextUrl.searchParams);
      return ok(await listAppealsQueue(page));
    }),
  );
}