/**
 * Annotation payload schema tests.
 */

import { describe, it, expect } from "vitest";
import {
  annotationPayloadSchema,
  imageBoxesPayloadSchema,
  actionSegmentsPayloadSchema,
} from "../payloads";

const validImage = {
  task_id: "5eed0000-0000-4000-8000-000000000040",
  asset_id: "5eed0000-0000-4000-8000-000000000020",
  schema_version: "image-boxes-v1",
  boxes: [{ x: 10, y: 10, w: 20, h: 20, class: "cup" }],
};

const validVideo = {
  task_id: "5eed0000-0000-4000-8000-000000000050",
  asset_id: "5eed0000-0000-4000-8000-000000000021",
  schema_version: "action-segments-v1",
  segments: [
    {
      start_ms: 0,
      end_ms: 1200,
      action_label: "reach",
      outcome: "success",
      confidence: 4,
    },
  ],
};

describe("image-boxes-v1 schema", () => {
  it("accepts a valid payload", () => {
    expect(imageBoxesPayloadSchema.safeParse(validImage).success).toBe(true);
  });

  it("accepts an empty boxes array (nothing to label)", () => {
    expect(
      imageBoxesPayloadSchema.safeParse({ ...validImage, boxes: [] }).success,
    ).toBe(true);
  });

  it("rejects a missing task_id", () => {
    const { task_id: _omit, ...rest } = validImage;
    void _omit;
    expect(imageBoxesPayloadSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-numeric box dimension", () => {
    const bad = { ...validImage, boxes: [{ ...validImage.boxes[0], w: "big" }] };
    expect(imageBoxesPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an out-of-range confidence", () => {
    const bad = {
      ...validImage,
      boxes: [{ ...validImage.boxes[0], confidence: 9 }],
    };
    expect(imageBoxesPayloadSchema.safeParse(bad).success).toBe(false);
  });
});

describe("action-segments-v1 schema", () => {
  it("accepts a valid payload", () => {
    expect(actionSegmentsPayloadSchema.safeParse(validVideo).success).toBe(true);
  });

  it("rejects an unknown action label", () => {
    const bad = {
      ...validVideo,
      segments: [{ ...validVideo.segments[0], action_label: "dance" }],
    };
    expect(actionSegmentsPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown outcome", () => {
    const bad = {
      ...validVideo,
      segments: [{ ...validVideo.segments[0], outcome: "maybe" }],
    };
    expect(actionSegmentsPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a negative start_ms", () => {
    const bad = {
      ...validVideo,
      segments: [{ ...validVideo.segments[0], start_ms: -1 }],
    };
    expect(actionSegmentsPayloadSchema.safeParse(bad).success).toBe(false);
  });
});

describe("annotationPayloadSchema (discriminated union)", () => {
  it("accepts both modalities", () => {
    expect(annotationPayloadSchema.safeParse(validImage).success).toBe(true);
    expect(annotationPayloadSchema.safeParse(validVideo).success).toBe(true);
  });

  it("rejects an unknown schema_version", () => {
    expect(
      annotationPayloadSchema.safeParse({
        ...validImage,
        schema_version: "image-boxes-v2",
      }).success,
    ).toBe(false);
  });
});
