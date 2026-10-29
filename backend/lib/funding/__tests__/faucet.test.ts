import { describe, expect, it } from "vitest";
import { GAS_ENOUGH_WEI, GAS_GRANT_WEI, MAX_USDC_PER_GRANT, planGrant } from "../faucet";

const u = (n: number) => BigInt(Math.round(n * 1_000_000));

describe("planGrant", () => {
  it("sends only what the job still needs, plus gas for an empty wallet", () => {
    expect(planGrant({ needUnits: u(0.4), balanceUnits: u(0.1), gasWei: BigInt(0), grantedTodayUnits: BigInt(0) })).toEqual({
      usdcUnits: u(0.3),
      gasWei: GAS_GRANT_WEI,
    });
  });

  it("sends nothing when the wallet can already pay", () => {
    expect(planGrant({ needUnits: u(0.4), balanceUnits: u(1), gasWei: GAS_ENOUGH_WEI, grantedTodayUnits: BigInt(0) })).toEqual({
      usdcUnits: BigInt(0),
      gasWei: BigInt(0),
    });
  });

  it("caps a grant and the daily total", () => {
    expect(planGrant({ needUnits: u(50), balanceUnits: BigInt(0), gasWei: GAS_ENOUGH_WEI, grantedTodayUnits: BigInt(0) }).usdcUnits).toBe(
      MAX_USDC_PER_GRANT,
    );
    expect(planGrant({ needUnits: u(2), balanceUnits: BigInt(0), gasWei: GAS_ENOUGH_WEI, grantedTodayUnits: u(4.5) }).usdcUnits).toBe(u(0.5));
    expect(planGrant({ needUnits: u(2), balanceUnits: BigInt(0), gasWei: GAS_ENOUGH_WEI, grantedTodayUnits: u(5) }).usdcUnits).toBe(BigInt(0));
  });
});
