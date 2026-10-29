import { describe, expect, it } from "vitest";
import { MAX_LIMIT, decodeCursor, encodeCursor, parseLimit, parseSince } from "../repository";

describe("cursor and parameters", () => {
  it("round-trips a cursor, keeping microsecond timestamps", () => {
    const c = { u: "2026-10-29T15:00:00.123456+00:00", i: "5d6d4c1e-0000-4000-8000-000000000001" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(null)).toBeNull();
  });

  it("rejects a tampered cursor", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(/cursor/);
    expect(() => decodeCursor(encodeCursor({ u: "x", i: "y" }))).toThrow(/cursor/);
  });

  it("bounds limit and validates since", () => {
    expect(parseLimit(null)).toBe(100);
    expect(parseLimit(String(MAX_LIMIT))).toBe(MAX_LIMIT);
    expect(() => parseLimit("0")).toThrow(/limit/);
    expect(() => parseLimit("1001")).toThrow(/limit/);
    expect(() => parseLimit("2.5")).toThrow(/limit/);
    expect(parseSince("2026-10-29")).toBe("2026-10-29T00:00:00.000Z");
    expect(() => parseSince("yesterday")).toThrow(/since/);
  });
});
