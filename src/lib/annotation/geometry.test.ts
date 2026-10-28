import { describe, expect, it } from "vitest";
import {
  clampBox,
  cornerAt,
  hitTestBoxes,
  moveBox,
  naturalScale,
  resizeBox,
  segmentBar,
  timeFraction,
} from "./geometry";

const BOUNDS = { w: 1000, h: 500 };

describe("clampBox", () => {
  it("rounds a valid box without moving it", () => {
    expect(clampBox({ x: 10.4, y: 20.6, w: 100.2, h: 50.5 }, BOUNDS)).toEqual({
      x: 10,
      y: 21,
      w: 100,
      h: 51,
    });
  });

  it("trims a box that overhangs the right/bottom edge", () => {
    expect(clampBox({ x: 950, y: 480, w: 200, h: 100 }, BOUNDS)).toEqual({
      x: 950,
      y: 480,
      w: 50,
      h: 20,
    });
  });

  it("never returns a zero or negative size", () => {
    const box = clampBox({ x: 5, y: 5, w: 0, h: -20 }, BOUNDS);
    expect(box.w).toBeGreaterThanOrEqual(1);
    expect(box.h).toBeGreaterThanOrEqual(1);
  });

  it("shrinks a box larger than the image to the image", () => {
    expect(clampBox({ x: 0, y: 0, w: 5000, h: 900 }, BOUNDS)).toEqual({
      x: 0,
      y: 0,
      w: 1000,
      h: 500,
    });
  });
});

describe("moveBox", () => {
  it("moves freely when there is room", () => {
    expect(moveBox({ x: 100, y: 100, w: 50, h: 50 }, 20, -30, BOUNDS)).toEqual({
      x: 120,
      y: 70,
      w: 50,
      h: 50,
    });
  });

  it("stops at the left/top edge", () => {
    expect(moveBox({ x: 10, y: 10, w: 50, h: 50 }, -100, -100, BOUNDS)).toEqual({
      x: 0,
      y: 0,
      w: 50,
      h: 50,
    });
  });

  it("stops at the right/bottom edge without resizing", () => {
    expect(moveBox({ x: 900, y: 400, w: 100, h: 100 }, 999, 999, BOUNDS)).toEqual({
      x: 900,
      y: 400,
      w: 100,
      h: 100,
    });
  });
});

describe("resizeBox", () => {
  it("grows from the south-east corner", () => {
    expect(resizeBox({ x: 100, y: 100, w: 100, h: 100 }, "se", 50, 20, BOUNDS)).toEqual({
      x: 100,
      y: 100,
      w: 150,
      h: 120,
    });
  });

  it("moves the origin when dragging the north-west corner", () => {
    expect(resizeBox({ x: 100, y: 100, w: 100, h: 100 }, "nw", 20, 30, BOUNDS)).toEqual({
      x: 120,
      y: 130,
      w: 80,
      h: 70,
    });
  });

  it("normalises a corner dragged past the opposite side", () => {
    const box = resizeBox({ x: 100, y: 100, w: 50, h: 50 }, "se", -200, -200, BOUNDS);
    expect(box.w).toBeGreaterThanOrEqual(1);
    expect(box.h).toBeGreaterThanOrEqual(1);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
  });

  it("clamps to the image bounds", () => {
    expect(resizeBox({ x: 900, y: 450, w: 100, h: 50 }, "se", 500, 500, BOUNDS)).toEqual({
      x: 900,
      y: 450,
      w: 100,
      h: 50,
    });
  });
});

describe("naturalScale", () => {
  it("maps a rendered delta back to intrinsic pixels", () => {
    expect(naturalScale({ w: 500, h: 250 }, { w: 1000, h: 500 })).toEqual({ x: 2, y: 2 });
  });

  it("is identity for a zero-sized element rather than dividing by zero", () => {
    expect(naturalScale({ w: 0, h: 0 }, BOUNDS)).toEqual({ x: 1, y: 1 });
  });
});

describe("hitTestBoxes", () => {
  const boxes = [
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 50, y: 50, w: 100, h: 100 },
  ];

  it("returns the topmost (last drawn) box under the point", () => {
    expect(hitTestBoxes(boxes, 75, 75)).toBe(1);
  });

  it("falls back to the lower box outside the overlap", () => {
    expect(hitTestBoxes(boxes, 10, 10)).toBe(0);
  });

  it("returns -1 when nothing is hit", () => {
    expect(hitTestBoxes(boxes, 500, 500)).toBe(-1);
  });
});

describe("cornerAt", () => {
  const box = { x: 100, y: 100, w: 100, h: 100 };

  it("detects each corner within tolerance", () => {
    expect(cornerAt({ x: 100, y: 100 }, box, 10)).toBe("nw");
    expect(cornerAt({ x: 200, y: 100 }, box, 10)).toBe("ne");
    expect(cornerAt({ x: 100, y: 200 }, box, 10)).toBe("sw");
    expect(cornerAt({ x: 200, y: 200 }, box, 10)).toBe("se");
  });

  it("returns null in the middle of the box (a move, not a resize)", () => {
    expect(cornerAt({ x: 150, y: 150 }, box, 10)).toBeNull();
  });

  it("returns null outside the tolerance ring", () => {
    expect(cornerAt({ x: 60, y: 60 }, box, 10)).toBeNull();
  });
});

describe("timeline helpers", () => {
  it("computes a clamped fraction", () => {
    expect(timeFraction(500, 1000)).toBe(0.5);
    expect(timeFraction(-100, 1000)).toBe(0);
    expect(timeFraction(9000, 1000)).toBe(1);
  });

  it("treats a zero or non-finite duration as the origin", () => {
    expect(timeFraction(500, 0)).toBe(0);
    expect(timeFraction(500, Number.NaN)).toBe(0);
  });

  it("renders a segment bar with a hairline minimum width", () => {
    expect(segmentBar({ start_ms: 250, end_ms: 750 }, 1000)).toEqual({
      leftPct: 25,
      widthPct: 50,
    });
    expect(segmentBar({ start_ms: 500, end_ms: 500 }, 1000).widthPct).toBe(0.5);
  });

  it("clamps bars to the track and degenerates safely on a zero duration", () => {
    expect(segmentBar({ start_ms: -100, end_ms: 5000 }, 1000)).toEqual({
      leftPct: 0,
      widthPct: 100,
    });
    expect(segmentBar({ start_ms: 100, end_ms: 200 }, 0)).toEqual({ leftPct: 0, widthPct: 0.5 });
  });
});
