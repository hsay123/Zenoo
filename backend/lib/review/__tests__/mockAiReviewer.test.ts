/**
 * MockAiReviewer tests.
 */

import { describe, it, expect } from "vitest";
import { MockAiReviewer } from "../mockAiReviewer";
import type { ActionSegmentsPayload, ImageBoxesPayload } from "@/src/types/api";

const reviewer = new MockAiReviewer();

const image = (
  boxes: ImageBoxesPayload["boxes"],
): ImageBoxesPayload => ({
  task_id: "t",
  asset_id: "a",
  schema_version: "image-boxes-v1",
  boxes,
});

const video: ActionSegmentsPayload = {
  task_id: "t",
  asset_id: "a",
  schema_version: "action-segments-v1",
  segments: [],
};

describe("MockAiReviewer", () => {
  it("accepts a normal image submission with high confidence", () => {
    const result = reviewer.review({
      modality: "image",
      payload: image([{ x: 0, y: 0, w: 10, h: 10, class: "cup", confidence: 4 }]),
      labelList: ["cup"],
    });
    expect(result.decision).toBe("accept");
    expect(result.reason_code).toBe("ACCEPTED");
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("asks for revision when no objects are labelled", () => {
    const result = reviewer.review({
      modality: "image",
      payload: image([]),
      labelList: ["cup"],
    });
    expect(result.decision).toBe("revise");
    expect(result.reason_code).toBe("MISSING_OBJECTS");
  });

  it("asks for revision when most boxes are low confidence", () => {
    const result = reviewer.review({
      modality: "image",
      payload: image([
        { x: 0, y: 0, w: 10, h: 10, class: "cup", confidence: 1 },
        { x: 5, y: 5, w: 10, h: 10, class: "cup", confidence: 2 },
      ]),
      labelList: ["cup"],
    });
    expect(result.decision).toBe("revise");
    expect(result.reason_code).toBe("LOW_QUALITY");
  });

  it("sends video timing to a human-style revise", () => {
    const result = reviewer.review({
      modality: "video",
      payload: video,
      labelList: ["reach"],
    });
    expect(result.decision).toBe("revise");
    expect(result.reason_code).toBe("IMPRECISE_TIMING");
  });
});
