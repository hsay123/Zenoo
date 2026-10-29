/**
 * Shared shell for `/api/v1` route handlers: API-key auth, the standard error
 * envelope, and the usage counter. Server-to-server API: no browser CORS
 * (an API key must never sit in a web page).
 */

import { connection, type NextRequest, type NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/response";
import { recordUsage, requireApiKey, requireScope, type ApiActor } from "@/lib/dataapi/auth";
import { countAccepted } from "@/lib/dataapi/repository";
import type { Job } from "@/src/types/api";

export interface V1Result<T> {
  response: NextResponse<T>;
  /** Records returned, for the monthly usage counter. */
  records?: number;
}

export async function v1<T>(
  req: NextRequest,
  scope: string,
  handler: (actor: ApiActor) => Promise<V1Result<T>>,
) {
  // Request-time only: stop prerendering before any header is read (outside
  // the error handler, so Next's prerender signal is never caught as an error).
  await connection();
  return withErrorHandler(async () => {
    const actor = await requireApiKey(req);
    requireScope(actor, scope);
    const { response, records = 0 } = await handler(actor);
    await recordUsage(actor, records);
    return response;
  });
}

/** The public shape of a dataset (one of the organisation's jobs). */
export async function toDataset(job: Job) {
  return {
    id: job.id,
    title: job.title,
    modality: job.modality,
    schema_version: job.modality === "image" ? "image-boxes-v1" : "action-segments-v1",
    classes: job.label_list,
    status: job.status,
    accepted_count: await countAccepted(job.id),
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}
