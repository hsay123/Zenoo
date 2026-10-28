import { describe, expect, it } from "vitest";
import { formatMon, formatTimecode } from "./format";

describe("formatMon", () => {
  it("formats the API decimal string as MON, trimming trailing zeros", () => {
    expect(formatMon("0.100000")).toBe("0.1 MON");
    expect(formatMon("1.000000")).toBe("1 MON");
    expect(formatMon("0.000000")).toBe("0 MON");
  });

  it("preserves significant decimals up to six places", () => {
    expect(formatMon("12.345678")).toBe("12.345678 MON");
    expect(formatMon("0.000001")).toBe("0.000001 MON");
  });

  it("groups thousands", () => {
    expect(formatMon("1234567.500000")).toBe("1,234,567.5 MON");
  });

  it("accepts numbers as well as strings", () => {
    expect(formatMon(0.25)).toBe("0.25 MON");
  });

  it("never emits a fiat symbol", () => {
    expect(formatMon("0.1")).not.toContain("$");
  });
});

describe("formatTimecode", () => {
  it("renders ms as mm:ss.mmm", () => {
    expect(formatTimecode(0)).toBe("00:00.000");
    expect(formatTimecode(12500)).toBe("00:12.500");
    expect(formatTimecode(65001)).toBe("01:05.001");
  });
});
