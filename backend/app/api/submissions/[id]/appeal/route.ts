/**
 * POST /api/submissions/{id}/appeal – appeal a rejected submission (contributor,
 * owns the submission). Moves the task to `appealed`.
 */

import type { NextRequest } from "next/server";
import { created, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { withIdempotency } from "@/lib/idempotency";
import { appealRequestSchema } from "@/lib/validation/appeals";
import { submitAppeal } from "@/lib/appeals/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const contributor = await requireRole(req, "contributor");
      const { id } = await params;
      const body = appealRequestSchema.parse(await readJson(req));

      const appeal = await withIdempotency({
        endpoint: `POST /api/submissions/${id}/appeal`,
        userId: contributor.id,
        rawKey: req.headers.get("idempotency-key"),
        action: () =>
          submitAppeal({
            submissionId: id,
            contributor,
            reason: body.reason,
          }),
      });

      return created(appeal);
    }),
  );
}