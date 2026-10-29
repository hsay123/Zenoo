/**
 * Data API transforms (docs/system/DATA-API.md §4.1): pure functions that turn
 * accepted export records into exactly the shape a training script reads.
 *
 * Order of operations per record: class filter (original names) → rename →
 * bbox mode → split → output format → field projection. Nothing here touches
 * the database, so every option is unit-tested in isolation.
 */

import { createHash } from "node:crypto";
import { HttpError } from "@/lib/api/errors";
import type { ExportRecord } from "@/lib/export/exporter";
import type { ActionSegment, BoundingBox, Modality } from "@/src/types/api";

export const LABEL_FORMATS = ["zeno", "coco", "yolo"] as const;
export const STREAM_FORMATS = ["jsonl", "csv"] as const;
export const BBOX_MODES = ["xywh", "xyxy", "normalized"] as const;
export type LabelFormat = (typeof LABEL_FORMATS)[number];
export type StreamFormat = (typeof STREAM_FORMATS)[number];
export type BboxMode = (typeof BBOX_MODES)[number];

/** A record as the API loads it: the export record plus API-only fields. */
export interface DataRecord extends ExportRecord {
  accepted_at: string | null;
  media_url?: string | null;
}

export interface TransformOptions {
  classes: Set<string> | null;
  rename: Map<string, string>;
  bbox: BboxMode;
  split: Array<{ name: string; weight: number }> | null;
  reviewer: "human" | "ai" | null;
  fields: string[] | null;
}

// ── Parsing query parameters ──────────────────────────────────────────────

const NAME = /^[A-Za-z0-9_.-]{1,64}$/;

function list(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function oneOf<T extends string>(name: string, raw: string | null, allowed: readonly T[], fallback: T): T {
  if (raw === null || raw === "") return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw HttpError.unprocessable(`${name} must be one of: ${allowed.join(", ")}`);
}

export function parseFormat(raw: string | null, modality: Modality): LabelFormat {
  const format = oneOf("format", raw, LABEL_FORMATS, "zeno");
  if (modality === "video" && format !== "zeno") {
    throw HttpError.unprocessable(
      "format=coco and format=yolo are for image boxes; video datasets support zeno (or jsonl/csv on /labels/stream)",
    );
  }
  return format;
}

export function parseStreamFormat(raw: string | null): StreamFormat {
  return oneOf("format", raw, STREAM_FORMATS, "jsonl");
}

export function parseTransformOptions(params: URLSearchParams): TransformOptions {
  const classes = list(params.get("classes"));
  for (const c of classes) {
    if (!NAME.test(c)) throw HttpError.unprocessable(`classes: invalid class name "${c}"`);
  }

  const rename = new Map<string, string>();
  for (const pair of list(params.get("rename"))) {
    const [from, to, extra] = pair.split(":");
    if (extra !== undefined || !from || !to || !NAME.test(from) || !NAME.test(to)) {
      throw HttpError.unprocessable(`rename: expected from:to pairs, got "${pair}"`);
    }
    rename.set(from, to);
  }

  let split: TransformOptions["split"] = null;
  const splitRaw = list(params.get("split"));
  if (splitRaw.length > 0) {
    split = splitRaw.map((part) => {
      const [name, weightRaw, extra] = part.split(":");
      const weight = Number(weightRaw);
      if (extra !== undefined || !name || !NAME.test(name) || !Number.isFinite(weight) || weight <= 0) {
        throw HttpError.unprocessable(`split: expected name:weight pairs like train:0.8,val:0.2, got "${part}"`);
      }
      return { name, weight };
    });
    const total = split.reduce((sum, s) => sum + s.weight, 0);
    split = split.map((s) => ({ name: s.name, weight: s.weight / total }));
  }

  const reviewerRaw = params.get("reviewer");
  const reviewer =
    reviewerRaw === null || reviewerRaw === ""
      ? null
      : reviewerRaw === "human" || reviewerRaw === "ai"
        ? reviewerRaw
        : (() => {
            throw HttpError.unprocessable("reviewer must be one of: human, ai");
          })();

  const fields = list(params.get("fields"));
  return {
    classes: classes.length ? new Set(classes) : null,
    rename,
    bbox: oneOf("bbox", params.get("bbox"), BBOX_MODES, "xywh"),
    split,
    reviewer,
    fields: fields.length ? fields : null,
  };
}

// ── Per-record transforms ─────────────────────────────────────────────────

/** Deterministic split: the same asset always lands in the same bucket. */
export function assignSplit(
  key: string,
  split: NonNullable<TransformOptions["split"]>,
): string {
  const digest = createHash("sha256").update(key).digest();
  const point = digest.readUInt32BE(0) / 0x1_0000_0000; // [0, 1)
  let acc = 0;
  for (const bucket of split) {
    acc += bucket.weight;
    if (point < acc) return bucket.name;
  }
  return split[split.length - 1].name;
}

export interface OutBox {
  class: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  confidence?: number;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function convertBox(
  box: BoundingBox,
  mode: BboxMode,
  size: { width: number | null; height: number | null },
): OutBox {
  const base = box.confidence === undefined ? {} : { confidence: box.confidence };
  if (mode === "xyxy") {
    return { class: box.class, x: box.x, y: box.y, x2: box.x + box.w, y2: box.y + box.h, ...base };
  }
  if (mode === "normalized") {
    if (!size.width || !size.height) {
      throw HttpError.unprocessable(
        "bbox=normalized needs image dimensions, which this asset lacks; use bbox=xywh",
      );
    }
    return {
      class: box.class,
      x: round(box.x / size.width),
      y: round(box.y / size.height),
      w: round(box.w / size.width),
      h: round(box.h / size.height),
      ...base,
    };
  }
  return { class: box.class, x: box.x, y: box.y, w: box.w, h: box.h, ...base };
}

type Relabelled = { boxes: BoundingBox[]; segments?: undefined } | { boxes?: undefined; segments: ActionSegment[] };

/** Boxes or segments after the class filter and rename; null = drop record. */
function relabel(record: DataRecord, opts: TransformOptions): Relabelled | null {
  const keep = (label: string) => !opts.classes || opts.classes.has(label);
  const name = (label: string) => opts.rename.get(label) ?? label;
  if (record.modality === "image") {
    const boxes = ((record.payload as { boxes?: BoundingBox[] }).boxes ?? [])
      .filter((b) => keep(b.class))
      .map((b) => ({ ...b, class: name(b.class) }));
    return opts.classes && boxes.length === 0 ? null : { boxes };
  }
  const segments = ((record.payload as { segments?: ActionSegment[] }).segments ?? [])
    .filter((s) => keep(s.action_label))
    .map((s) => ({ ...s, action_label: name(s.action_label) as ActionSegment["action_label"] }));
  return opts.classes && segments.length === 0 ? null : { segments };
}

function project(obj: Record<string, unknown>, fields: string[] | null): Record<string, unknown> {
  if (!fields) return obj;
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in obj) out[f] = obj[f];
  return out;
}

/** One record in the Zeno shape (also the JSONL line shape). */
export function toZenoRecord(record: DataRecord, opts: TransformOptions): Record<string, unknown> | null {
  if (opts.reviewer && record.reviewer_type !== opts.reviewer) return null;
  const labels = relabel(record, opts);
  if (!labels) return null;
  const size = { width: record.width, height: record.height };
  const out: Record<string, unknown> = {
    task_id: record.task_id,
    asset_id: record.asset_id,
    asset_hash: record.asset_hash,
    modality: record.modality,
    schema_version: record.schema_version,
    width: record.width,
    height: record.height,
    reviewer_type: record.reviewer_type,
    accepted_at: record.accepted_at,
    payload_hash: record.payload_hash,
    receipt_tx_hash: record.receipt_tx_hash,
  };
  if (opts.split) out.split = assignSplit(record.asset_hash || record.asset_id, opts.split);
  if (labels.boxes) out.boxes = labels.boxes.map((b) => convertBox(b, opts.bbox, size));
  else out.segments = labels.segments;
  if (record.media_url !== undefined) out.media_url = record.media_url;
  return project(out, opts.fields);
}

// ── Page formats ──────────────────────────────────────────────────────────

/** The class index order for COCO/YOLO: the job's list, renamed, filtered. */
export function classOrder(labelList: string[], opts: TransformOptions): string[] {
  const order: string[] = [];
  for (const label of labelList) {
    if (opts.classes && !opts.classes.has(label)) continue;
    const renamed = opts.rename.get(label) ?? label;
    if (!order.includes(renamed)) order.push(renamed);
  }
  return order;
}

export function formatPage(
  records: DataRecord[],
  format: LabelFormat,
  opts: TransformOptions,
  labelList: string[],
): { data: unknown; count: number; classes?: string[] } {
  const zeno = records
    .map((r) => ({ record: r, out: toZenoRecord(r, opts) }))
    .filter((x): x is { record: DataRecord; out: Record<string, unknown> } => x.out !== null);

  if (format === "zeno") return { data: zeno.map((x) => x.out), count: zeno.length };

  const classes = classOrder(labelList, opts);
  // Boxes of classes outside the job's list (should not happen) are appended.
  const indexOf = (name: string) => {
    if (!classes.includes(name)) classes.push(name);
    return classes.indexOf(name);
  };

  if (format === "yolo") {
    const yoloOpts = { ...opts, bbox: "normalized" as const, fields: null };
    const data = zeno.map(({ record }) => {
      const out = toZenoRecord(record, yoloOpts)!;
      const boxes = out.boxes as OutBox[];
      return {
        asset_id: record.asset_id,
        file: `${record.asset_id}.txt`,
        width: record.width,
        height: record.height,
        ...(out.split ? { split: out.split } : {}),
        ...(record.media_url !== undefined ? { media_url: record.media_url } : {}),
        // YOLO: class cx cy w h, all normalised to 0–1.
        lines: boxes.map(
          (b) => `${indexOf(b.class)} ${round(b.x + b.w! / 2)} ${round(b.y + b.h! / 2)} ${b.w} ${b.h}`,
        ),
      };
    });
    return { data, count: data.length, classes };
  }

  // COCO: string ids (asset_id) stay stable across pages; recipes map to ints.
  const images = zeno.map(({ record, out }) => ({
    id: record.asset_id,
    file_name: `${record.asset_id}`,
    width: record.width,
    height: record.height,
    ...(out.split ? { split: out.split } : {}),
    ...(record.media_url !== undefined ? { media_url: record.media_url } : {}),
  }));
  const annotations = zeno.flatMap(({ record }) => {
    const boxes = (toZenoRecord(record, { ...opts, bbox: "xywh", fields: null })!.boxes ?? []) as OutBox[];
    return boxes.map((b, i) => ({
      id: `${record.asset_id}#${i}`,
      image_id: record.asset_id,
      category_id: indexOf(b.class) + 1,
      bbox: [b.x, b.y, b.w, b.h],
      area: (b.w ?? 0) * (b.h ?? 0),
      iscrowd: 0,
    }));
  });
  return {
    data: {
      images,
      annotations,
      categories: classes.map((name, i) => ({ id: i + 1, name })),
    },
    count: images.length,
    classes,
  };
}

// ── Stream formats ────────────────────────────────────────────────────────

export const STREAM_CSV_COLUMNS = [
  "task_id", "asset_id", "asset_hash", "modality", "split", "reviewer_type", "accepted_at",
  "class", "x", "y", "w", "h", "x2", "y2", "start_ms", "end_ms", "outcome", "confidence",
] as const;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV rows for one record (one row per box or segment). */
export function toCsvRows(out: Record<string, unknown>): string[] {
  const base = (extra: Record<string, unknown>) =>
    STREAM_CSV_COLUMNS.map((c) => csvCell(c in extra ? extra[c] : out[c])).join(",");
  const boxes = (out.boxes as OutBox[] | undefined) ?? [];
  const segments = (out.segments as ActionSegment[] | undefined) ?? [];
  if (boxes.length) return boxes.map((b) => base({ ...b }));
  if (segments.length) {
    return segments.map((s) =>
      base({ class: s.action_label, start_ms: s.start_ms, end_ms: s.end_ms, outcome: s.outcome, confidence: s.confidence }),
    );
  }
  return [base({})];
}
