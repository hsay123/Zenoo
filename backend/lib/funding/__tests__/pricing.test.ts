import { describe, it, expect } from "vitest";
import { quoteFunding } from "../pricing";

describe("quoteFunding", () => {
  it("makes the fee 20% of what the buyer pays (PRD: 0.04 reward -> 0.05 price)", () => {
    const quote = quoteFunding("0.04", 2000);
    expect(quote).toEqual({
      payout: "0.04",
      fee: "0.01",
      total: "0.05",
      fee_bps: 2000,
      payout_units: "40000",
      total_cents: 5,
    });
  });

  it("scales exactly for a full job budget", () => {
    // 100 boxes x 0.04 = 4 USDC payouts -> 1 USDC fee -> 5 USDC (500 cents).
    expect(quoteFunding("4", 2000)).toMatchObject({
      payout: "4",
      fee: "1",
      total: "5",
      payout_units: "4000000",
      total_cents: 500,
    });
  });

  it("rounds the fee up to the next base unit, never down", () => {
    // 0.000001 * 2000 / 8000 = 0.00000025 -> 0.000001
    expect(quoteFunding("0.000001", 2000).fee).toBe("0.000001");
  });

  it("rounds the card charge up to the next cent", () => {
    // 0.03 payout -> 0.0075 fee -> 0.0375 total -> 4 cents
    expect(quoteFunding("0.03", 2000)).toMatchObject({ total: "0.0375", total_cents: 4 });
  });

  it("charges no fee at 0 bps", () => {
    expect(quoteFunding("2.5", 0)).toMatchObject({ fee: "0", total: "2.5", total_cents: 250 });
  });

  it("refuses invalid budgets and fee rates", () => {
    expect(() => quoteFunding("0", 2000)).toThrow();
    expect(() => quoteFunding("1.0000001", 2000)).toThrow();
    expect(() => quoteFunding("abc", 2000)).toThrow();
    expect(() => quoteFunding("1", 10_000)).toThrow();
    expect(() => quoteFunding("1", -1)).toThrow();
    expect(() => quoteFunding("1", 12.5)).toThrow();
  });
});
