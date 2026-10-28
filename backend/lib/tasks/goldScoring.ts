/**
 * Automatic gold-task scoring (PRD §8.2).
 *
 * Image submissions score boxes by class match + intersection-over-union
 * (IoU). Video submissions score segments by action label + timing tolerance.
 *
 * Matching is greedy (not optimal assignment): for each gold item, claim the
 * best still-unmatched submitted item that clears the bar. A submission passes
 * only when every gold item is matched AND the contributor submitted no extra
 * items (exact cardinality).
 */

import type { ActionSegment, BoundingBox } from "@/src/types/api";

export interface GoldBox {
  x: number;
  y: number;
  w: number;
  h: number;
  class: string;
}

export interface GoldSegment {
  start_ms: number;
  end_ms: number;
  action_label: string;
}

export interface GoldImageAnswer {
  boxes: GoldBox[];
}

export interface GoldVideoAnswer {
  segments: GoldSegment[];
}

export interface GoldScore {
  pass: boolean;
  matched: number;
  expected: number;
  submitted: number;
}

/** Intersection-over-union of two boxes, in [0, 1]. */
export function intersectionOverUnion(a: GoldBox, b: GoldBox): number {
  const interLeft = Math.max(a.x, b.x);
  const interTop = Math.max(a.y, b.y);
  const interRight = Math.min(a.x + a.w, b.x + b.w);
  const interBottom = Math.min(a.y + a.h, b.y + b.h);

  const interWidth = Math.max(0, interRight - interLeft);
  const interHeight = Math.max(0, interBottom - interTop);
  const intersection = interWidth * interHeight;
  if (intersection <= 0) return 0;

  const union = a.w * a.h + b.w * b.h - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

/**
 * Score submitted boxes against the gold boxes.
 * A box matches when its class is identical and IoU >= `iouThreshold`.
 */
export function scoreImageBoxes(
  submitted: BoundingBox[],
  gold: GoldBox[],
  iouThreshold: number,
): GoldScore {
  const used = new Array<boolean>(submitted.length).fill(false);
  let matched = 0;

  for (const goldBox of gold) {
    let bestIndex = -1;
    let bestIou = -1;
    for (let i = 0; i < submitted.length; i++) {
      if (used[i]) continue;
      const candidate = submitted[i];
      if (candidate.class !== goldBox.class) continue;
      const iou = intersectionOverUnion(goldBox, candidate);
      if (iou >= iouThreshold && iou > bestIou) {
        bestIou = iou;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      used[bestIndex] = true;
      matched++;
    }
  }

  return {
    pass: matched === gold.length && submitted.length === gold.length,
    matched,
    expected: gold.length,
    submitted: submitted.length,
  };
}

/**
 * Score submitted segments against the gold segments.
 * A segment matches when its action label is identical and both endpoints are
 * within `msTolerance` of the gold segment.
 */
export function scoreVideoSegments(
  submitted: ActionSegment[],
  gold: GoldSegment[],
  msTolerance: number,
): GoldScore {
  const used = new Array<boolean>(submitted.length).fill(false);
  let matched = 0;

  for (const goldSegment of gold) {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < submitted.length; i++) {
      if (used[i]) continue;
      const candidate = submitted[i];
      if (candidate.action_label !== goldSegment.action_label) continue;
      const startDelta = Math.abs(candidate.start_ms - goldSegment.start_ms);
      const endDelta = Math.abs(candidate.end_ms - goldSegment.end_ms);
      if (startDelta > msTolerance || endDelta > msTolerance) continue;
      const delta = startDelta + endDelta;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      used[bestIndex] = true;
      matched++;
    }
  }

  return {
    pass: matched === gold.length && submitted.length === gold.length,
    matched,
    expected: gold.length,
    submitted: submitted.length,
  };
}
