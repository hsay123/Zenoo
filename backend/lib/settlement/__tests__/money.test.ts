/**
 * Fixed-point decimal money helpers tests.
 */

import { describe, it, expect } from "vitest";
import { sumDecimalStrings, withinBudget } from "../money";

describe("sumDecimalStrings", () => {
  it("returns 0 for an empty list", () => {
    expect(sumDecimalStrings([])).toBe("0");
  });

  it("sums a single value unchanged (normalised)", () => {
    expect(sumDecimalStrings(["3.50"])).toBe("3.5");
    expect(sumDecimalStrings(["3"])).toBe("3");
  });

  it("adds two decimals exactly", () => {
    expect(sumDecimalStrings(["0.1", "0.2"])).toBe("0.3");
    expect(sumDecimalStrings(["1.5", "2"])).toBe("3.5");
  });

  it("keeps micro precision from numeric columns", () => {
    expect(sumDecimalStrings(["1.000000", "0.000001"])).toBe("1.000001");
  });

  it("handles large integer magnitudes without precision loss", () => {
    expect(sumDecimalStrings(["1000000000000000000", "1"])).toBe(
      "1000000000000000001",
    );
  });

  it("sums many values", () => {
    expect(sumDecimalStrings(["0.25", "0.25", "0.25", "0.25"])).toBe("1");
  });
});

describe("withinBudget", () => {
  it("allows payout count that fits the budget", () => {
    expect(withinBudget("1.5", 2, "3.000000")).toBe(true);
    expect(withinBudget("0.25", 4, "1")).toBe(true);
  });

  it("rejects payout count beyond the budget", () => {
    expect(withinBudget("1.5", 3, "3")).toBe(false);
    expect(withinBudget("1", 1, "0.999999")).toBe(false);
  });

  it("edge equality counts as within budget", () => {
    expect(withinBudget("1", 10, "10")).toBe(true);
  });
});