/**
 * Accepted-label export serialisers.
 *
 * PRD §14: images export as COCO-style JSON, videos as JSONL (nested) or CSV
 * (flat). Every export bundles a provenance manifest (dataset id, schema
 * version, asset hashes, rights reference, review-policy version, reviewer type
 * per record, export time, record counts) and never contains contributor
 * identity data.
 */

import type {
  ActionSegmentsPayload,
  ExportManifest,
  ImageBoxesPayload,
  Modality,
  ReviewerType,
} from "@/src/types/api";

export interface ExportRecord {
  task_id: string;
  asset_id: string;
  modality: Modality;
  asset_hash: string;
  schema_version: string;
  payload_hash: string;
  reviewer_type: ReviewerType;
  submitted_at: string;
  receipt_tx_hash: string | null;
  width: number | null;
  height: number | null;
  payload: ImageBoxesPayload | ActionSegmentsPayload;
}

export type ExportFormat = "json" | "jsonl" | "csv";

export interface ExportBundle {
  body: string;
  contentType: string;
  extension: string;
}

export const SCHEMA_BY_MODALITY: Record<Modality, string> = {
  image: "image-boxes-v1",
  video: "action-segments-v1",
};

export function isImagePayload(
  payload: ExportRecord["payload"],
): payload is ImageBoxesPayload {
  return payload.schema_version === "image-boxes-v1";
}

export interface BuildManifestInput {
  datasetId: string;
  schemaVersion: string;
  records: ExportRecord[];
  rightsReference: string | null;
  reviewPolicyVersion: string | null;
  exportTime?: string;
}

export function buildManifest(input: BuildManifestInput): ExportManifest {
  const assetHashes: Record<string, string> = {};
  for (const record of input.records) {
    assetHashes[record.asset_id] = record.asset_hash;
  }
  return {
    dataset_id: input.datasetId,
    schema_version: input.schemaVersion,
    asset_hashes: assetHashes,
    rights_reference: input.rightsReference,
    review_policy_version: input.reviewPolicyVersion,
    export_time: input.exportTime ?? new Date().toISOString(),
    record_counts: {
      total: input.records.length,
      image: input.records.filter((r) => r.modality === "image").length,
      video: input.records.filter((r) => r.modality === "video").length,
    },
  };
}

/** COCO-style JSON for image jobs. */
export function buildCoco(
  records: ExportRecord[],
  manifest: ExportManifest,
  labelList: string[],
): Record<string, unknown> {
  const categories = [...labelList];
  const seen = new Set(categories);
  for (const record of records) {
    if (!isImagePayload(record.payload)) continue;
    for (const box of record.payload.boxes) {
      if (!seen.has(box.class)) {
        seen.add(box.class);
        categories.push(box.class);
      }
    }
  }
  const categoryId = new Map(categories.map((name, index) => [name, index + 1]));

  const images: unknown[] = [];
  const annotations: unknown[] = [];
  let annotationId = 1;

  records.forEach((record, recordIndex) => {
    if (!isImagePayload(record.payload)) return;
    const imageId = recordIndex + 1;
    images.push({
      id: imageId,
      file_name: record.asset_id,
      asset_id: record.asset_id,
      task_id: record.task_id,
      asset_hash: record.asset_hash,
      width: record.width,
      height: record.height,
      reviewer_type: record.reviewer_type,
      payload_hash: record.payload_hash,
    });
    for (const box of record.payload.boxes) {
      annotations.push({
        id: annotationId++,
        image_id: imageId,
        category_id: categoryId.get(box.class) ?? null,
        bbox: [box.x, box.y, box.w, box.h],
        area: box.w * box.h,
        confidence: box.confidence ?? null,
        task_id: record.task_id,
        reviewer_type: record.reviewer_type,
        payload_hash: record.payload_hash,
        receipt_tx_hash: record.receipt_tx_hash,
      });
    }
  });

  return {
    manifest,
    coco: {
      info: {
        dataset_id: manifest.dataset_id,
        schema_version: manifest.schema_version,
        export_time: manifest.export_time,
        rights_reference: manifest.rights_reference,
        review_policy_version: manifest.review_policy_version,
      },
      licenses: [],
      images,
      annotations,
      categories: categories.map((name) => ({ id: categoryId.get(name), name })),
    },
  };
}

/** Newline-delimited export: a manifest line followed by one line per record. */
export function buildJsonl(
  manifest: ExportManifest,
  records: ExportRecord[],
): string {
  const lines = [JSON.stringify({ type: "manifest", manifest })];
  for (const record of records) {
    lines.push(JSON.stringify({ type: "record", ...record }));
  }
  return `${lines.join("\n")}\n`;
}

const CSV_COLUMNS = [
  "record_type",
  "task_id",
  "asset_id",
  "modality",
  "schema_version",
  "payload_hash",
  "reviewer_type",
  "submitted_at",
  "receipt_tx_hash",
  "asset_hash",
  "x",
  "y",
  "w",
  "h",
  "class",
  "confidence",
  "start_ms",
  "end_ms",
  "action_label",
  "object",
  "outcome",
  "failure_reason",
  "manifest_json",
] as const;

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: Record<string, unknown>): string {
  return CSV_COLUMNS.map((column) => csvEscape(values[column])).join(",");
}

/** Flat CSV: a manifest row followed by one row per box/segment. */
export function buildCsv(
  manifest: ExportManifest,
  records: ExportRecord[],
): string {
  const lines = [CSV_COLUMNS.join(",")];
  lines.push(csvRow({ record_type: "manifest", manifest_json: JSON.stringify(manifest) }));

  for (const record of records) {
    const base: Record<string, unknown> = {
      task_id: record.task_id,
      asset_id: record.asset_id,
      modality: record.modality,
      schema_version: record.schema_version,
      payload_hash: record.payload_hash,
      reviewer_type: record.reviewer_type,
      submitted_at: record.submitted_at,
      receipt_tx_hash: record.receipt_tx_hash,
      asset_hash: record.asset_hash,
    };
    if (isImagePayload(record.payload)) {
      if (record.payload.boxes.length === 0) {
        lines.push(csvRow({ ...base, record_type: "box" }));
      }
      for (const box of record.payload.boxes) {
        lines.push(
          csvRow({
            ...base,
            record_type: "box",
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
            class: box.class,
            confidence: box.confidence ?? null,
          }),
        );
      }
    } else {
      if (record.payload.segments.length === 0) {
        lines.push(csvRow({ ...base, record_type: "segment" }));
      }
      for (const segment of record.payload.segments) {
        lines.push(
          csvRow({
            ...base,
            record_type: "segment",
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
            action_label: segment.action_label,
            object: segment.object ?? null,
            outcome: segment.outcome,
            failure_reason: segment.failure_reason ?? null,
            confidence: segment.confidence,
          }),
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export interface SerializeExportInput {
  format: ExportFormat;
  records: ExportRecord[];
  manifest: ExportManifest;
  labelList: string[];
  modality: Modality;
}

export function serializeExport(input: SerializeExportInput): ExportBundle {
  const { format, records, manifest, labelList, modality } = input;

  if (format === "jsonl") {
    return {
      body: buildJsonl(manifest, records),
      contentType: "application/x-ndjson",
      extension: "jsonl",
    };
  }
  if (format === "csv") {
    return {
      body: buildCsv(manifest, records),
      contentType: "text/csv",
      extension: "csv",
    };
  }
  if (modality === "image") {
    return {
      body: JSON.stringify(buildCoco(records, manifest, labelList), null, 2),
      contentType: "application/json",
      extension: "json",
    };
  }
  return {
    body: JSON.stringify({ manifest, records }, null, 2),
    contentType: "application/json",
    extension: "json",
  };
}