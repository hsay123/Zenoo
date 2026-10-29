/**
 * GET /api/v1/datasets/{id}/labels – accepted labels, filtered and shaped for
 * training, one page at a time (Data API). Parameters: docs/system/DATA-API.md §4.1.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  decodeCursor,
  loadLabelPage,
  loadOrganizationJob,
  parseLimit,
  parseSince,
} from "@/lib/dataapi/repository";
import { formatPage, parseFormat, parseTransformOptions } from "@/lib/dataapi/transform";
import { v1 } from "@/lib/dataapi/handler";
import { requireScope } from "@/lib/dataapi/auth";
import { HttpError } from "@/lib/api/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return v1(req, "labels:read", async (actor) => {
    const { id } = await params;
    const search = req.nextUrl.searchParams;
    const job = await loadOrganizationJob(actor.organizationId, id);

    // Validate every parameter before touching the database.
    const format = parseFormat(search.get("format"), job.modality);
    const opts = parseTransformOptions(search);
    const limit = parseLimit(search.get("limit"));
    const cursor = decodeCursor(search.get("cursor"));
    const since = parseSince(search.get("since"));
    const mediaRaw = search.get("media") ?? "none";
    if (mediaRaw !== "none" && mediaRaw !== "signed_url") {
      throw HttpError.unprocessable("media must be one of: none, signed_url");
    }
    const media = mediaRaw === "signed_url";
    if (media) requireScope(actor, "media:read");

    const page = await loadLabelPage(job, { cursor, limit, since, media });
    const shaped = formatPage(page.records, format, opts, job.label_list);

    return {
      response: NextResponse.json({
        data: shaped.data,
        next_cursor: page.nextCursor,
        meta: {
          dataset_id: job.id,
          format,
          count: shaped.count,
          schema_version: job.modality === "image" ? "image-boxes-v1" : "action-segments-v1",
          ...(shaped.classes ? { classes: shaped.classes } : {}),
          ...(media ? { media_url_expires_in: 900 } : {}),
        },
      }),
      records: shaped.count,
    };
  });
}
