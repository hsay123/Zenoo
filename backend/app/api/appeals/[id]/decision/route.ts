/**
 * POST /api/appeals/{id}/decision – uphold or dismiss an appeal
 * (reviewer/admin; never the appeal's own contributor).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { appealDecisionSchema } from "@/lib/validation/appeals";
import { decideAppeal } from "@/lib/appeals/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const reviewer = await requireRole(req, "reviewer", "admin");
      const { id } = await params;
      const body = appealDecisionSchema.parse(await readJson(req));

      const appeal = await decideAppeal({
        appealId: id,
        reviewer,
        decision: body.decision,
        reasonCode: body.reason_code,
        notes: body.notes,
      });

      return ok(appeal);
    }),
  );
}