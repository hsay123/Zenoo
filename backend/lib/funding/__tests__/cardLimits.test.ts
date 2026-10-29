import { describe, expect, it } from "vitest";
import { CARD_MIN_TOTAL_CENTS, TREASURY_MIN_GAS_WEI, cardAvailability } from "../cardLimits";

const base = {
  configured: true,
  totalCents: 500,
  payoutUnits: BigInt(4_000_000), // 4 USDC
  capacity: { usdcUnits: BigInt(10_000_000), gasWei: TREASURY_MIN_GAS_WEI },
  treasuryConfigured: true,
};

describe("cardAvailability", () => {
  it("allows a card payment the treasury can fund", () => {
    expect(cardAvailability(base)).toEqual({ available: true, reason: null });
  });

  it("refuses below Dodo's minimum, naming the price", () => {
    const r = cardAvailability({ ...base, totalCents: CARD_MIN_TOTAL_CENTS - 1 });
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/start at \$0\.50; this job costs \$0\.49/);
  });

  it("refuses when the treasury holds less USDC than the job's budget", () => {
    const r = cardAvailability({ ...base, capacity: { usdcUnits: BigInt(3_999_999), gasWei: TREASURY_MIN_GAS_WEI } });
    expect(r).toMatchObject({ available: false });
    expect(r.reason).toMatch(/float is lower than this job's budget/);
  });

  it("refuses when the treasury is low on gas or unreachable", () => {
    expect(cardAvailability({ ...base, capacity: { usdcUnits: BigInt(10_000_000), gasWei: BigInt(1) } }).reason).toMatch(/gas is low/);
    expect(cardAvailability({ ...base, capacity: null }).reason).toMatch(/unreachable/);
  });

  it("is off when Dodo is not configured; without a treasury it still allows (manual funding)", () => {
    expect(cardAvailability({ ...base, configured: false }).available).toBe(false);
    expect(cardAvailability({ ...base, treasuryConfigured: false, capacity: null }).available).toBe(true);
  });
});
