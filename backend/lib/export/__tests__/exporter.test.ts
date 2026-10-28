/**
 * Export serialiser tests.
 */

import { describe, it, expect } from "vitest";
import {
  buildCoco,
  buildCsv,
  buildJsonl,
  buildManifest,
  serializeExport,
  type ExportRecord,
} from "../exporter";
import type { ActionSegmentsPayload, ImageBoxesPayload } from "@/src/types/api";

const imageRecord: ExportRecord = {
  task_id: "task-img",
  asset_id: "asset-img",
  modality: "image",
  asset_hash: "0xasset",
  schema_version: "image-boxes-v1",
  payload_hash: "0xpayload",
  reviewer_type: "ai",
  submitted_at: "2026-10-11T00:00:00.000Z",
  receipt_tx_hash: "0xtx",
  width: 640,
  height: 480,
  payload: {
    task_id: "task-img",
    asset_id: "asset-img",
    schema_version: "image-boxes-v1",
    boxes: [
      { x: 1, y: 2, w: 3, h: 4, class: "cup", confidence: 4 },
    ],
  } satisfies ImageBoxesPayload,
};

const videoRecord: ExportRecord = {
  task_id: "task-vid",
  asset_id: "asset-vid",
  modality: "video",
  asset_hash: "0xassetv",
  schema_version: "action-segments-v1",
  payload_hash: "0xpayloadv",
  reviewer_type: "human",
  submitted_at: "2026-10-11T01:00:00.000Z",
  receipt_tx_hash: null,
  width: null,
  height: null,
  payload: {
    task_id: "task-vid",
    asset_id: "asset-vid",
    schema_version: "action-segments-v1",
    segments: [
      {
        start_ms: 0,
        end_ms: 500,
        action_label: "grasp",
        object: "pen",
        outcome: "success",
        confidence: 4,
      },
    ],
  } satisfies ActionSegmentsPayload,
};

const manifestFor = (records: ExportRecord[]) =>
  buildManifest({
    datasetId: "job-1",
    schemaVersion: "image-boxes-v1",
    records,
    rightsReference: "rights-ref",
    reviewPolicyVersion: "0xpolicy",
    exportTime: "2026-10-11T02:00:00.000Z",
  });

describe("buildManifest", () => {
  it("summarises counts, asset hashes and provenance", () => {
    const manifest = manifestFor([imageRecord, videoRecord]);
    expect(manifest.dataset_id).toBe("job-1");
    expect(manifest.record_counts).toEqual({ total: 2, image: 1, video: 1 });
    expect(manifest.asset_hashes).toEqual({
      "asset-img": "0xasset",
      "asset-vid": "0xassetv",
    });
    expect(manifest.rights_reference).toBe("rights-ref");
    expect(manifest.review_policy_version).toBe("0xpolicy");
    expect(manifest.export_time).toBe("2026-10-11T02:00:00.000Z");
  });
});

describe("buildCoco", () => {
  it("emits COCO images, annotations and categories", () => {
    const coco = buildCoco([imageRecord], manifestFor([imageRecord]), ["cup"]) as {
      coco: {
        images: unknown[];
        annotations: Array<{ bbox: number[]; category_id: number; reviewer_type: string }>;
        categories: Array<{ id: number; name: string }>;
      };
    };
    expect(coco.coco.images).toHaveLength(1);
    expect(coco.coco.annotations).toHaveLength(1);
    expect(coco.coco.annotations[0].bbox).toEqual([1, 2, 3, 4]);
    expect(coco.coco.annotations[0].category_id).toBe(1);
    expect(coco.coco.annotations[0].reviewer_type).toBe("ai");
    expect(coco.coco.categories).toEqual([{ id: 1, name: "cup" }]);
  });

  it("adds unseen classes from the payload to categories", () => {
    const coco = buildCoco([imageRecord], manifestFor([imageRecord]), []) as {
      coco: { categories: Array<{ name: string }> };
    };
    expect(coco.coco.categories.map((c) => c.name)).toContain("cup");
  });
});

describe("buildJsonl", () => {
  it("emits a manifest line followed by record lines", () => {
    const lines = buildJsonl(manifestFor([imageRecord, videoRecord]), [
      imageRecord,
      videoRecord,
    ])
      .trim()
      .split("\n");
    expect(lines).toHaveLength(3);
    const first = JSON.parse(lines[0]);
    expect(first.type).toBe("manifest");
    expect(first.manifest.dataset_id).toBe("job-1");
    expect(JSON.parse(lines[2]).task_id).toBe("task-vid");
  });
});

describe("buildCsv", () => {
  it("emits a manifest row, box rows, and flat segment rows", () => {
    const rows = buildCsv(manifestFor([imageRecord, videoRecord]), [
      imageRecord,
      videoRecord,
    ])
      .trim()
      .split("\n");
    expect(rows).toHaveLength(4); // header + manifest + image box + video segment
    expect(rows[0].startsWith("record_type,")).toBe(true);
    expect(rows[1]).toContain("manifest");
    expect(rows[2]).toContain("box");
    expect(rows[3]).toContain("grasp");
    expect(rows[3]).toContain("segment");
  });

  it("escapes commas and quotes", () => {
    const record: ExportRecord = {
      ...imageRecord,
      payload: {
        ...(imageRecord.payload as ImageBoxesPayload),
        boxes: [{ x: 0, y: 0, w: 1, h: 1, class: 'a,"b"', confidence: 3 }],
      },
    };
    const csv = buildCsv(manifestFor([record]), [record]);
    expect(csv).toContain('"a,""b"""');
  });
});

describe("serializeExport", () => {
  it("picks the right content type per format", () => {
    const records = [imageRecord];
    const manifest = manifestFor(records);
    expect(serializeExport({ format: "json", records, manifest, labelList: [], modality: "image" }).contentType).toBe("application/json");
    expect(serializeExport({ format: "jsonl", records, manifest, labelList: [], modality: "image" }).contentType).toBe("application/x-ndjson");
    expect(serializeExport({ format: "csv", records, manifest, labelList: [], modality: "image" }).contentType).toBe("text/csv");
  });

  it("emits a COCO document for image jobs in json format", () => {
    const records = [imageRecord];
    const bundle = serializeExport({
      format: "json",
      records,
      manifest: manifestFor(records),
      labelList: ["cup"],
      modality: "image",
    });
    const parsed = JSON.parse(bundle.body);
    expect(parsed.coco).toBeDefined();
    expect(parsed.manifest.dataset_id).toBe("job-1");
  });

  it("emits a manifest + records document for video jobs in json format", () => {
    const records = [videoRecord];
    const bundle = serializeExport({
      format: "json",
      records,
      manifest: manifestFor(records),
      labelList: [],
      modality: "video",
    });
    const parsed = JSON.parse(bundle.body);
    expect(parsed.coco).toBeUndefined();
    expect(parsed.records).toHaveLength(1);
  });
});