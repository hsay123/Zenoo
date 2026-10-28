/**
 * Semantic annotation validation tests.
 */

import { describe, it, expect } from "vitest";
import { HttpError } from "@/lib/api/errors";
import {
  parseAnnotationPayload,
  validateAnnotation,
  validateImageBoxes,
  validateVideoSegments,
  type ValidationContext,
} from "../validate";
import type {
  ActionSegmentsInput,
  ImageBoxesInput,
} from "@/lib/validation/payloads";

const imageCtx: ValidationContext = {
  taskId: "task-1",
  assetId: "asset-1",
  modality: "image",
  labelList: ["cup", "red_block"],
  width: 1280,
  height: 720,
  durationMs: null,
};

const videoCtx: ValidationContext = {
  taskId: "task-2",
  assetId: "asset-2",
  modality: "video",
  labelList: ["reach", "grasp", "lift"],
  width: null,
  height: null,
  durationMs: 12000,
};

function image(
  boxes: ImageBoxesInput["boxes"],
  overrides: Partial<ImageBoxesInput> = {},
): ImageBoxesInput {
  return {
    task_id: "task-1",
    asset_id: "asset-1",
    schema_version: "image-boxes-v1",
    boxes,
    ...overrides,
  };
}

function video(
  segments: ActionSegmentsInput["segments"],
  overrides: Partial<ActionSegmentsInput> = {},
): ActionSegmentsInput {
  return {
    task_id: "task-2",
    asset_id: "asset-2",
    schema_version: "action-segments-v1",
    segments,
    ...overrides,
  };
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("validateImageBoxes", () => {
  it("returns no issues for a valid submission", () => {
    const issues = validateImageBoxes(
      image([{ x: 10, y: 10, w: 20, h: 20, class: "cup" }]),
      imageCtx,
    );
    expect(issues).toEqual([]);
  });

  it("flags task_id / asset_id mismatches as SCHEMA_INVALID", () => {
    const issues = validateImageBoxes(
      image([], { task_id: "other", asset_id: "nope" }),
      imageCtx,
    );
    expect(codes(issues)).toContain("SCHEMA_INVALID");
    expect(issues.map((i) => i.path[0])).toEqual(["task_id", "asset_id"]);
  });

  it("flags non-positive box dimensions", () => {
    const issues = validateImageBoxes(
      image([{ x: 10, y: 10, w: 0, h: 20, class: "cup" }]),
      imageCtx,
    );
    expect(codes(issues)).toContain("BOX_NEGATIVE_SIZE");
  });

  it("flags boxes outside the image bounds", () => {
    const issues = validateImageBoxes(
      image([{ x: 1200, y: 10, w: 200, h: 20, class: "cup" }]),
      imageCtx,
    );
    expect(codes(issues)).toContain("BOX_OUT_OF_BOUNDS");
  });

  it("flags classes not in the job label list", () => {
    const issues = validateImageBoxes(
      image([{ x: 10, y: 10, w: 20, h: 20, class: "unknown" }]),
      imageCtx,
    );
    expect(codes(issues)).toContain("BOX_INVALID_CLASS");
  });
});

describe("validateVideoSegments", () => {
  const seg = (
    start_ms: number,
    end_ms: number,
    extra: Partial<ActionSegmentsInput["segments"][number]> = {},
  ) => ({
    start_ms,
    end_ms,
    action_label: "reach" as const,
    outcome: "success" as const,
    confidence: 4,
    ...extra,
  });

  it("returns no issues for adjacent, ordered segments", () => {
    const issues = validateVideoSegments(
      video([seg(0, 1200, { action_label: "reach" }), seg(1200, 3000, { action_label: "grasp" })]),
      videoCtx,
    );
    expect(issues).toEqual([]);
  });

  it("flags out-of-order segments", () => {
    const issues = validateVideoSegments(
      video([seg(1000, 2000), seg(0, 500)]),
      videoCtx,
    );
    expect(codes(issues)).toContain("SEGMENT_ORDER");
  });

  it("flags overlapping segments", () => {
    const issues = validateVideoSegments(
      video([seg(0, 1000), seg(900, 1500)]),
      videoCtx,
    );
    expect(codes(issues)).toContain("SEGMENT_OVERLAP");
  });

  it("flags segments beyond the clip duration", () => {
    const issues = validateVideoSegments(video([seg(0, 13000)]), videoCtx);
    expect(codes(issues)).toContain("SEGMENT_OUT_OF_BOUNDS");
  });

  it("flags end_ms <= start_ms", () => {
    const issues = validateVideoSegments(video([seg(500, 500)]), videoCtx);
    expect(codes(issues)).toContain("SCHEMA_INVALID");
  });

  it("requires a failure_reason for failure outcomes", () => {
    const issues = validateVideoSegments(
      video([seg(0, 1000, { outcome: "failure" })]),
      videoCtx,
    );
    expect(codes(issues)).toContain("SEGMENT_MISSING_FAILURE_REASON");
  });
});

describe("validateAnnotation dispatch", () => {
  it("routes video payloads to the segment validator", () => {
    const payload = parseAnnotationPayload({
      task_id: "task-2",
      asset_id: "asset-2",
      schema_version: "action-segments-v1",
      segments: [
        {
          start_ms: 0,
          end_ms: 1000,
          action_label: "reach",
          outcome: "success",
          confidence: 3,
        },
      ],
    });
    expect(validateAnnotation(payload, videoCtx)).toEqual([]);
  });
});

describe("parseAnnotationPayload", () => {
  it("throws a 422 HttpError with SCHEMA_INVALID issues on bad input", () => {
    try {
      parseAnnotationPayload({ schema_version: "image-boxes-v1" });
      throw new Error("expected parse to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      const httpError = err as HttpError;
      expect(httpError.status).toBe(422);
      expect(httpError.code).toBe("VALIDATION_ERROR");
      const details = httpError.details as { code: string }[];
      expect(details.length).toBeGreaterThan(0);
      expect(details[0].code).toBe("SCHEMA_INVALID");
    }
  });
});
