/**
 * POST /api/tasks/{id}/submit – validate and submit an annotation.
 *
 * Guarantees:
 *   - Idempotent: an `Idempotency-Key` header makes retries replay the first
 *     response (stored in `idempotency_keys`).
 *   - Rate limited per contributor.
 *   - Append-only: each accepted call inserts a new versioned `submissions`
 *     row; payloads are never overwritten.
 */

import type { NextRequest } from "next/server";
import { created, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { parseAnnotationPayload } from "@/lib/annotation/validate";
import { withIdempotency } from "@/lib/idempotency";
import { consume } from "@/lib/rateLimit";
import { submitAnnotation } from "@/lib/tasks/submissions";
import type { Submission } from "@/src/types/api";

const SUBMIT_RATE = { points: 20, duration: 60 };

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "contributor");
      const { id } = await params;

      const payload = parseAnnotationPayload(await readJson(req));

      const submission = await withIdempotency<Submission>({
        endpoint: `POST /api/tasks/${id}/submit`,
        userId: user.id,
        rawKey: req.headers.get("idempotency-key"),
        action: async () => {
          await consume("submit", user.id, SUBMIT_RATE);
          return submitAnnotation({
            taskId: id,
            contributorId: user.id,
            payload,
          });
        },
      });

      return created(submission);
    }),
  );
}
