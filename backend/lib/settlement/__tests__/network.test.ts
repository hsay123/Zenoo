/**
 * Network and token-unit tests.
 *
 * USDC has 6 decimals. A decimal bug here would over- or under-pay every
 * contributor (PRD §10 risk #1), so the conversion is pinned exactly and
 * anything that is not a plain ≤6-decimal string is refused, not guessed.
 */

import { describe, it, expect } from "vitest";
import {
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  chainForId,
  fromTokenUnits,
  isAllowedChain,
  resolveRpcUrl,
  toTokenUnits,
} from "../network";

describe("toTokenUnits", () => {
  it("converts decimal USDC strings to 6-decimal base units", () => {
    expect(toTokenUnits("1")).toBe(BigInt(1_000_000));
    expect(toTokenUnits("0.04")).toBe(BigInt(40_000));
    expect(toTokenUnits("0.05")).toBe(BigInt(50_000));
    expect(toTokenUnits("0.000001")).toBe(BigInt(1));
    expect(toTokenUnits("12.345678")).toBe(BigInt(12_345_678));
    expect(toTokenUnits("1.000000")).toBe(BigInt(1_000_000)); // DB NUMERIC(18,6) shape
    expect(toTokenUnits("999999999999.999999")).toBe(BigInt("999999999999999999"));
  });

  it("is not the 18-decimal (wei) conversion", () => {
    expect(toTokenUnits("1")).not.toBe(BigInt("1000000000000000000"));
  });

  it("refuses more than 6 decimal places", () => {
    expect(() => toTokenUnits("0.0000001")).toThrow(/max 6 decimals/);
  });

  it("refuses anything that is not a plain non-negative decimal", () => {
    for (const bad of ["", " ", "-1", "+1", "1e6", "1e-6", "0x10", "1,000", "1.", ".5", "abc", "01"]) {
      expect(() => toTokenUnits(bad), bad).toThrow();
    }
    expect(() => toTokenUnits(1 as unknown as string)).toThrow();
  });
});

describe("fromTokenUnits", () => {
  it("round-trips base units to decimal strings", () => {
    expect(fromTokenUnits(BigInt(40_000))).toBe("0.04");
    expect(fromTokenUnits(BigInt(1_000_000))).toBe("1");
    expect(fromTokenUnits(BigInt(1))).toBe("0.000001");
    expect(toTokenUnits(fromTokenUnits(BigInt(12_345_678)))).toBe(BigInt(12_345_678));
  });
});

describe("chains", () => {
  it("knows Base and Base Sepolia", () => {
    expect(BASE_SEPOLIA_CHAIN_ID).toBe(84532);
    expect(BASE_CHAIN_ID).toBe(8453);
    expect(chainForId(84532)?.id).toBe(84532);
    expect(chainForId(8453)?.id).toBe(8453);
    expect(chainForId(10143)).toBeNull(); // Monad testnet (prior work)
  });

  it("allows only Base Sepolia for settlement this week", () => {
    expect(isAllowedChain(84532)).toBe(true);
    expect(isAllowedChain(8453)).toBe(false);
    expect(isAllowedChain(10143)).toBe(false);
  });
});

describe("resolveRpcUrl", () => {
  it("prefers RPC_URL and falls back to the deprecated MONAD_RPC_URL", () => {
    expect(resolveRpcUrl({ RPC_URL: "https://a", MONAD_RPC_URL: "https://b" })).toBe("https://a");
    expect(resolveRpcUrl({ RPC_URL: undefined, MONAD_RPC_URL: "https://b" })).toBe("https://b");
    expect(resolveRpcUrl({ RPC_URL: undefined, MONAD_RPC_URL: undefined })).toBe("");
  });
});
