import { describe, expect, it } from "vitest";
import {
  assignSplit,
  classOrder,
  convertBox,
  formatPage,
  parseFormat,
  parseStreamFormat,
  parseTransformOptions,
  toCsvRows,
  toZenoRecord,
  type DataRecord,
} from "../transform";

const params = (q: string) => new URLSearchParams(q);
const opts = (q = "") => parseTransformOptions(params(q));

const image = (over: Partial<DataRecord> = {}): DataRecord => ({
  task_id: "t1",
  asset_id: "a1",
  modality: "image",
  asset_hash: "h1",
  schema_version: "image-boxes-v1",
  payload_hash: "0xp",
  reviewer_type: "human",
  submitted_at: "2026-10-29T00:00:00Z",
  receipt_tx_hash: "0xr",
  width: 200,
  height: 100,
  accepted_at: "2026-10-29T01:00:00Z",
  payload: {
    task_id: "t1",
    asset_id: "a1",
    schema_version: "image-boxes-v1",
    boxes: [
      { class: "cup", x: 20, y: 10, w: 40, h: 20 },
      { class: "hand", x: 100, y: 50, w: 50, h: 50, confidence: 4 },
    ],
  },
  ...over,
});

const video = (): DataRecord => ({
  ...image({ modality: "video", schema_version: "action-segments-v1", width: null, height: null }),
  payload: {
    task_id: "t2",
    asset_id: "a2",
    schema_version: "action-segments-v1",
    segments: [
      { start_ms: 0, end_ms: 500, action_label: "reach", outcome: "success", confidence: 5 },
      { start_ms: 500, end_ms: 900, action_label: "grasp", outcome: "success", confidence: 4 },
    ],
  },
});

describe("parsing", () => {
  it("defaults to zeno/xywh with no filters", () => {
    const o = opts();
    expect(o).toMatchObject({ classes: null, bbox: "xywh", split: null, reviewer: null, fields: null });
    expect(parseFormat(null, "image")).toBe("zeno");
    expect(parseStreamFormat(null)).toBe("jsonl");
  });

  it("refuses coco/yolo for video and unknown values with a clear 422", () => {
    expect(() => parseFormat("yolo", "video")).toThrow(/image boxes/);
    expect(() => parseFormat("parquet", "image")).toThrow(/format must be one of/);
    expect(() => opts("bbox=polar")).toThrow(/bbox must be one of/);
    expect(() => opts("reviewer=robot")).toThrow(/reviewer/);
    expect(() => opts("rename=cup")).toThrow(/rename/);
    expect(() => opts("split=train:abc")).toThrow(/split/);
    expect(() => opts("classes=bad name")).toThrow(/classes/);
  });

  it("normalises split weights", () => {
    expect(opts("split=train:8,val:2").split).toEqual([
      { name: "train", weight: 0.8 },
      { name: "val", weight: 0.2 },
    ]);
  });
});

describe("records", () => {
  it("filters classes by original name, then renames", () => {
    const out = toZenoRecord(image(), opts("classes=cup&rename=cup:mug"))!;
    expect(out.boxes).toEqual([{ class: "mug", x: 20, y: 10, w: 40, h: 20 }]);
  });

  it("drops a record left with no boxes, and filters by reviewer", () => {
    expect(toZenoRecord(image(), opts("classes=robot_arm"))).toBeNull();
    expect(toZenoRecord(image(), opts("reviewer=ai"))).toBeNull();
    expect(toZenoRecord(image({ reviewer_type: "ai" }), opts("reviewer=ai"))).not.toBeNull();
  });

  it("converts boxes to xyxy and normalised coordinates", () => {
    const size = { width: 200, height: 100 };
    const box = { class: "cup", x: 20, y: 10, w: 40, h: 20 };
    expect(convertBox(box, "xyxy", size)).toEqual({ class: "cup", x: 20, y: 10, x2: 60, y2: 30 });
    expect(convertBox(box, "normalized", size)).toEqual({ class: "cup", x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    expect(() => convertBox(box, "normalized", { width: null, height: null })).toThrow(/dimensions/);
  });

  it("assigns a deterministic split", () => {
    const split = opts("split=train:0.8,val:0.2").split!;
    const first = assignSplit("asset-hash-123", split);
    for (let i = 0; i < 5; i++) expect(assignSplit("asset-hash-123", split)).toBe(first);
    const counts: Record<string, number> = { train: 0, val: 0 };
    for (let i = 0; i < 2000; i++) counts[assignSplit(`h${i}`, split)]++;
    expect(counts.train / 2000).toBeGreaterThan(0.75);
    expect(counts.train / 2000).toBeLessThan(0.85);
  });

  it("projects fields", () => {
    expect(Object.keys(toZenoRecord(image(), opts("fields=asset_id,boxes"))!)).toEqual(["asset_id", "boxes"]);
  });

  it("filters and renames video segments by action label", () => {
    const out = toZenoRecord(video(), opts("classes=grasp&rename=grasp:pick"))!;
    expect(out.segments).toEqual([
      { start_ms: 500, end_ms: 900, action_label: "pick", outcome: "success", confidence: 4 },
    ]);
  });

  it("never leaks contributor identity fields", () => {
    const out = toZenoRecord(image(), opts())!;
    expect(Object.keys(out).some((k) => /contributor|reviewer_id|email|wallet/.test(k))).toBe(false);
  });
});

describe("page formats", () => {
  const labels = ["cup", "red_block", "hand"];

  it("orders classes from the job's list, after filter and rename", () => {
    expect(classOrder(labels, opts("classes=hand,cup&rename=cup:mug"))).toEqual(["mug", "hand"]);
  });

  it("writes YOLO lines: class cx cy w h, normalised", () => {
    const page = formatPage([image()], "yolo", opts(), labels);
    expect(page.classes).toEqual(labels);
    const [item] = page.data as Array<{ file: string; lines: string[] }>;
    expect(item.file).toBe("a1.txt");
    expect(item.lines).toEqual(["0 0.2 0.2 0.2 0.2", "2 0.625 0.75 0.25 0.5"]);
  });

  it("writes COCO with stable string ids and 1-based categories", () => {
    const page = formatPage([image()], "coco", opts("classes=hand"), labels);
    const coco = page.data as { images: unknown[]; annotations: Array<Record<string, unknown>>; categories: unknown[] };
    expect(coco.categories).toEqual([{ id: 1, name: "hand" }]);
    expect(coco.images).toEqual([{ id: "a1", file_name: "a1", width: 200, height: 100 }]);
    expect(coco.annotations).toEqual([
      { id: "a1#0", image_id: "a1", category_id: 1, bbox: [100, 50, 50, 50], area: 2500, iscrowd: 0 },
    ]);
  });

  it("writes one CSV row per box or segment, escaping text", () => {
    const rows = toCsvRows(toZenoRecord(image(), opts("rename=cup:big"))!);
    expect(rows).toHaveLength(2);
    expect(rows[0].startsWith("t1,a1,h1,image,,human,")).toBe(true);
    expect(toCsvRows(toZenoRecord(video(), opts())!)).toHaveLength(2);
  });
});
