/**
 * GET /api/jobs/{id}/export – accepted-label export + provenance manifest.
 *
 * Buyer (own jobs) or admin only. `format` = json (COCO for images) | jsonl |
 * csv. Only `accepted`/`paid` tasks are included and no contributor identity
 * data is ever emitted.
 */

import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { loadJobForActor } from "@/lib/jobs/repository";
import { exportFormatSchema } from "@/lib/validation/export";
import { loadAcceptedExportData } from "@/lib/export/repository";
import { buildManifest, serializeExport } from "@/lib/export/exporter";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const actor = await requireRole(req, "buyer", "admin");
      const { id } = await params;
      const job = await loadJobForActor(id, actor);

      const rawFormat = req.nextUrl.searchParams.get("format") ?? "json";
      const parsed = exportFormatSchema.safeParse(rawFormat);
      if (!parsed.success) {
        throw HttpError.unprocessable("format must be one of: json, jsonl, csv");
      }

      const { records, schemaVersion, rightsReference } =
        await loadAcceptedExportData(job);

      const manifest = buildManifest({
        datasetId: job.id,
        schemaVersion,
        records,
        rightsReference,
        reviewPolicyVersion: job.policy_hash,
      });

      const bundle = serializeExport({
        format: parsed.data,
        records,
        manifest,
        labelList: job.label_list,
        modality: job.modality,
      });

      return new NextResponse(bundle.body, {
        status: 200,
        headers: {
          "Content-Type": `${bundle.contentType}; charset=utf-8`,
          "Content-Disposition": `attachment; filename="job-${job.id}-export.${bundle.extension}"`,
        },
      });
    }),
  );
}