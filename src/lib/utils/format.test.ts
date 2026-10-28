import { describe, expect, it } from "vitest";
import { formatMon, formatTimecode, formatUsdc } from "./format";

describe("formatUsdc", () => {
  it("formats the API decimal string as USDC, trimming trailing zeros", () => {
    expect(formatUsdc("0.100000")).toBe("0.1 USDC");
    expect(formatUsdc("1.000000")).toBe("1 USDC");
    expect(formatUsdc("0.000000")).toBe("0 USDC");
  });

  it("preserves significant decimals up to six places", () => {
    expect(formatUsdc("12.345678")).toBe("12.345678 USDC");
    expect(formatUsdc("0.000001")).toBe("0.000001 USDC");
    expect(formatUsdc("0.040000")).toBe("0.04 USDC");
  });

  it("groups thousands", () => {
    expect(formatUsdc("1234567.500000")).toBe("1,234,567.5 USDC");
  });

  it("accepts numbers as well as strings", () => {
    expect(formatUsdc(0.25)).toBe("0.25 USDC");
  });

  it("never emits a fiat symbol or the old MON unit", () => {
    expect(formatUsdc("0.1")).not.toContain("$");
    expect(formatUsdc("0.1")).not.toContain("MON");
  });

  it("keeps the deprecated formatMon name as an alias", () => {
    expect(formatMon("0.1")).toBe("0.1 USDC");
  });
});

describe("formatTimecode", () => {
  it("renders ms as mm:ss.mmm", () => {
    expect(formatTimecode(0)).toBe("00:00.000");
    expect(formatTimecode(12500)).toBe("00:12.500");
    expect(formatTimecode(65001)).toBe("01:05.001");
  });
});
