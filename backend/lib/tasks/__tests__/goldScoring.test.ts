/**
 * Gold scoring tests.
 */

import { describe, it, expect } from "vitest";
import {
  intersectionOverUnion,
  scoreImageBoxes,
  scoreVideoSegments,
  type GoldBox,
  type GoldSegment,
} from "../goldScoring";
import type { ActionSegment, BoundingBox } from "@/src/types/api";

const box = (x: number, y: number, w: number, h: number, klass: string): BoundingBox => ({
  x,
  y,
  w,
  h,
  class: klass,
});

const goldBox = (x: number, y: number, w: number, h: number, klass: string): GoldBox => ({
  x,
  y,
  w,
  h,
  class: klass,
});

const segment = (
  start_ms: number,
  end_ms: number,
  action_label: ActionSegment["action_label"],
): ActionSegment => ({
  start_ms,
  end_ms,
  action_label,
  outcome: "success",
  confidence: 4,
});

const goldSegment = (
  start_ms: number,
  end_ms: number,
  action_label: string,
): GoldSegment => ({ start_ms, end_ms, action_label });

describe("intersectionOverUnion", () => {
  it("is 1 for identical boxes", () => {
    expect(intersectionOverUnion(goldBox(0, 0, 10, 10, "cup"), box(0, 0, 10, 10, "cup"))).toBe(1);
  });

  it("is 0 for disjoint boxes", () => {
    expect(intersectionOverUnion(goldBox(0, 0, 10, 10, "cup"), box(20, 20, 10, 10, "cup"))).toBe(0);
  });

  it("computes a partial overlap", () => {
    // intersection 50, union 150 -> 1/3
    expect(
      intersectionOverUnion(goldBox(0, 0, 10, 10, "cup"), box(5, 0, 10, 10, "cup")),
    ).toBeCloseTo(1 / 3, 5);
  });
});

describe("scoreImageBoxes", () => {
  it("passes when every gold box is matched and cardinality is equal", () => {
    const gold = [goldBox(0, 0, 10, 10, "cup")];
    const submitted = [box(0, 0, 10, 10, "cup")];
    expect(scoreImageBoxes(submitted, gold, 0.5)).toEqual({
      pass: true,
      matched: 1,
      expected: 1,
      submitted: 1,
    });
  });

  it("fails on cardinality mismatch (extra boxes)", () => {
    const gold = [goldBox(0, 0, 10, 10, "cup")];
    const submitted = [box(0, 0, 10, 10, "cup"), box(50, 50, 5, 5, "red_block")];
    expect(scoreImageBoxes(submitted, gold, 0.5).pass).toBe(false);
  });

  it("fails when the class differs", () => {
    const gold = [goldBox(0, 0, 10, 10, "cup")];
    const submitted = [box(0, 0, 10, 10, "red_block")];
    expect(scoreImageBoxes(submitted, gold, 0.5).pass).toBe(false);
  });

  it("fails when IoU is below the threshold", () => {
    const gold = [goldBox(0, 0, 10, 10, "cup")];
    const submitted = [box(8, 8, 10, 10, "cup")];
    expect(scoreImageBoxes(submitted, gold, 0.5).pass).toBe(false);
  });

  it("matches a partial but sufficient overlap", () => {
    const gold = [goldBox(0, 0, 10, 10, "cup")];
    const submitted = [box(5, 0, 10, 10, "cup")];
    expect(scoreImageBoxes(submitted, gold, 0.5).matched).toBe(0); // IoU 1/3 < 0.5
  });
});

describe("scoreVideoSegments", () => {
  const gold = [goldSegment(0, 1200, "reach"), goldSegment(1200, 3000, "grasp")];

  it("passes when segments match on label and timing", () => {
    const submitted = [segment(0, 1200, "reach"), segment(1250, 2950, "grasp")];
    expect(scoreVideoSegments(submitted, gold, 500).pass).toBe(true);
  });

  it("fails when timing drifts beyond tolerance", () => {
    const submitted = [segment(0, 1200, "reach"), segment(2000, 4000, "grasp")];
    expect(scoreVideoSegments(submitted, gold, 500).pass).toBe(false);
  });

  it("fails when a label differs", () => {
    const submitted = [segment(0, 1200, "reach"), segment(1200, 3000, "lift")];
    expect(scoreVideoSegments(submitted, gold, 500).pass).toBe(false);
  });

  it("fails on cardinality mismatch", () => {
    const submitted = [segment(0, 1200, "reach")];
    expect(scoreVideoSegments(submitted, gold, 500).pass).toBe(false);
  });
});
