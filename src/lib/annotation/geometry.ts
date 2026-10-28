/**
 * Pure geometry and timeline helpers for the annotation workspace.
 *
 * Kept free of React and the DOM so the coordinate maths — which decides what a
 * contributor's drag actually means — can be unit-tested directly. The
 * component is only responsible for turning pointer events into the small
 * numbers these functions consume.
 *
 * All box coordinates here are in **natural pixels** (the image's intrinsic
 * size), which is also how boxes are stored and sent to the backend. Callers
 * convert from rendered/pointer coordinates before calling.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  w: number;
  h: number;
}

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

/**
 * Keep a box inside the image and at least 1×1 px. The top-left anchor is
 * preserved and the size is trimmed to fit, which is what a resize wants: the
 * corner you are *not* dragging must stay put.
 */
export function clampBox(box: Box, bounds: Bounds): Box {
  const x = Math.max(0, Math.min(Math.round(box.x), Math.max(0, bounds.w - 1)));
  const y = Math.max(0, Math.min(Math.round(box.y), Math.max(0, bounds.h - 1)));
  const w = Math.max(1, Math.min(Math.round(box.w), bounds.w - x));
  const h = Math.max(1, Math.min(Math.round(box.h), bounds.h - y));
  return { x, y, w, h };
}

/** Move a box by a natural-pixel delta, stopping at the image edges. */
export function moveBox(box: Box, dx: number, dy: number, bounds: Bounds): Box {
  const start = clampBox(box, bounds);
  const x = Math.max(0, Math.min(start.x + dx, bounds.w - start.w));
  const y = Math.max(0, Math.min(start.y + dy, bounds.h - start.h));
  return { x: Math.round(x), y: Math.round(y), w: start.w, h: start.h };
}

/**
 * Resize a box by dragging one corner. Negative intermediate sizes (a corner
 * dragged past the opposite side) are normalised before clamping.
 */
export function resizeBox(
  box: Box,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  bounds: Bounds,
): Box {
  let { x, y, w, h } = box;

  if (handle.includes("e")) w += dx;
  if (handle.includes("s")) h += dy;
  if (handle.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (handle.includes("n")) {
    y += dy;
    h -= dy;
  }

  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }

  return clampBox({ x, y, w, h }, bounds);
}

/**
 * Scale factor that converts a rendered-pixel delta into natural pixels for an
 * element whose intrinsic size is `bounds`.
 */
export function naturalScale(display: Bounds, bounds: Bounds): { x: number; y: number } {
  return {
    x: display.w > 0 ? bounds.w / display.w : 1,
    y: display.h > 0 ? bounds.h / display.h : 1,
  };
}

/** Does a natural-pixel point fall inside a box? */
export function boxContains(box: Box, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/**
 * Which box (last drawn wins) contains a natural-pixel point, if any. Used to
 * pick the box under the pointer before starting a move.
 */
export function hitTestBoxes(boxes: Box[], x: number, y: number): number {
  for (let i = boxes.length - 1; i >= 0; i -= 1) {
    if (boxContains(boxes[i], x, y)) return i;
  }
  return -1;
}

/**
 * Which corner handle (if any) a natural-pixel point hits, within `tolerance`
 * natural pixels. Corner drags resize; everything else inside the box moves.
 */
export function cornerAt(
  point: { x: number; y: number },
  box: Box,
  tolerance: number,
): ResizeHandle | null {
  const nearLeft = Math.abs(point.x - box.x) <= tolerance;
  const nearRight = Math.abs(point.x - (box.x + box.w)) <= tolerance;
  const nearTop = Math.abs(point.y - box.y) <= tolerance;
  const nearBottom = Math.abs(point.y - (box.y + box.h)) <= tolerance;

  if (nearLeft && nearTop) return "nw";
  if (nearRight && nearTop) return "ne";
  if (nearLeft && nearBottom) return "sw";
  if (nearRight && nearBottom) return "se";
  return null;
}

/** Fraction (0..1) of `ms` within `durationMs`, clamped to the track. */
export function timeFraction(ms: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const value = ms / durationMs;
  return Math.max(0, Math.min(1, value));
}

/** Left/width percentages for a segment bar. Width never drops below a hairline. */
export function segmentBar(
  segment: { start_ms: number; end_ms: number },
  durationMs: number,
): { leftPct: number; widthPct: number } {
  const start = timeFraction(segment.start_ms, durationMs);
  const end = timeFraction(segment.end_ms, durationMs);
  return { leftPct: start * 100, widthPct: Math.max(0.5, (end - start) * 100) };
}

/** Milliseconds at a horizontal fraction of the timeline. */
export function fractionToMs(fraction: number, durationMs: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return Math.round(f * Math.max(0, durationMs));
}
