/**
 * GET /api/v1/datasets/{id}/labels/stream – every accepted label in one
 * response, as NDJSON (default) or CSV (Data API). Pages internally, 1000
 * records at a time, so memory stays flat for any dataset size. Accepts the
 * same filters as /labels except format/limit/cursor.
 */

import { NextResponse, connection, type NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api/response";
import { HttpError } from "@/lib/api/errors";
import { recordUsage, requireApiKey, requireScope } from "@/lib/dataapi/auth";
import {
  MAX_LIMIT,
  loadLabelPage,
  loadOrganizationJob,
  parseSince,
  type Cursor,
} from "@/lib/dataapi/repository";
import {
  STREAM_CSV_COLUMNS,
  parseStreamFormat,
  parseTransformOptions,
  toCsvRows,
  toZenoRecord,
} from "@/lib/dataapi/transform";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection(); // request-time only (see lib/dataapi/handler.ts)
  return withErrorHandler(async () => {
    const actor = await requireApiKey(req);
    requireScope(actor, "labels:read");
    const { id } = await params;
    const search = req.nextUrl.searchParams;
    const job = await loadOrganizationJob(actor.organizationId, id);
    const format = parseStreamFormat(search.get("format"));
    const opts = parseTransformOptions(search);
    const since = parseSince(search.get("since"));
    if ((search.get("media") ?? "none") !== "none") {
      throw HttpError.unprocessable("media links are page-scoped; use /labels?media=signed_url");
    }

    // Fetch the first page before answering, so a failure is a JSON error.
    let page = await loadLabelPage(job, { cursor: null, limit: MAX_LIMIT, since, media: false });
    const encoder = new TextEncoder();
    let total = 0;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (format === "csv") controller.enqueue(encoder.encode(`${STREAM_CSV_COLUMNS.join(",")}\n`));
          for (;;) {
            const lines: string[] = [];
            for (const record of page.records) {
              const out = toZenoRecord(record, opts);
              if (!out) continue;
              total += 1;
              if (format === "csv") lines.push(...toCsvRows(out));
              else lines.push(JSON.stringify(out));
            }
            if (lines.length) controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
            if (!page.nextCursor) break;
            const cursor = JSON.parse(Buffer.from(page.nextCursor, "base64url").toString("utf8")) as Cursor;
            page = await loadLabelPage(job, { cursor, limit: MAX_LIMIT, since, media: false });
          }
          controller.close();
        } catch (error) {
          // Headers are sent: end the stream; the client sees a short body.
          console.error("[data-api] stream failed", error);
          controller.error(error);
        } finally {
          void recordUsage(actor, total);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Zeno-Dataset": job.id,
      },
    });
  });
}
