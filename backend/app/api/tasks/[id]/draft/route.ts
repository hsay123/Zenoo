/**
 * PUT /api/tasks/{id}/draft – autosave a draft annotation (lease owner only).
 *
 * Drafts are a mutable scratch space; semantic validation (bounds, overlaps)
 * is deferred to submit so a contributor can save work in progress.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { parseAnnotationPayload } from "@/lib/annotation/validate";
import { loadWorkPayload, saveDraftPayload } from "@/lib/tasks/submissions";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "contributor");
      const { id } = await params;

      const result = await loadWorkPayload({
        taskId: id,
        contributorId: user.id,
      });

      return ok(result);
    }),
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "contributor");
      const { id } = await params;

      const payload = parseAnnotationPayload(await readJson(req));
      const result = await saveDraftPayload({
        taskId: id,
        contributorId: user.id,
        payload,
      });

      return ok(result);
    }),
  );
}
