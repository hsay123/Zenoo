/**
 * Fast-submit guard tests.
 */

import { describe, it, expect } from "vitest";
import {
  claimTimeFromLease,
  elapsedSinceClaimMs,
  isFastSubmission,
} from "../fastSubmitGuard";

const LEASE_MINUTES = 30;
// Claim at 00:00:00Z, lease expires 00:30:00Z.
const EXPIRY = "2026-01-01T00:30:00.000Z";
const CLAIM_MS = Date.parse("2026-01-01T00:00:00.000Z");

describe("claimTimeFromLease", () => {
  it("derives the claim time by subtracting the lease duration", () => {
    expect(claimTimeFromLease(EXPIRY, LEASE_MINUTES)).toBe(CLAIM_MS);
  });
});

describe("elapsedSinceClaimMs", () => {
  it("measures time between the derived claim and submission", () => {
    const submittedAt = new Date("2026-01-01T00:00:10.000Z");
    expect(elapsedSinceClaimMs(EXPIRY, LEASE_MINUTES, submittedAt)).toBe(10_000);
  });
});

describe("isFastSubmission", () => {
  it("flags a submission sooner than the threshold", () => {
    expect(
      isFastSubmission({
        leaseExpiry: EXPIRY,
        leaseMinutes: LEASE_MINUTES,
        thresholdSeconds: 30,
        submittedAt: new Date("2026-01-01T00:00:10.000Z"),
      }),
    ).toBe(true);
  });

  it("does not flag a submission after the threshold", () => {
    expect(
      isFastSubmission({
        leaseExpiry: EXPIRY,
        leaseMinutes: LEASE_MINUTES,
        thresholdSeconds: 30,
        submittedAt: new Date("2026-01-01T00:01:00.000Z"),
      }),
    ).toBe(false);
  });

  it("does not flag when there is no lease", () => {
    expect(
      isFastSubmission({
        leaseExpiry: null,
        leaseMinutes: LEASE_MINUTES,
        thresholdSeconds: 30,
        submittedAt: new Date("2026-01-01T00:00:10.000Z"),
      }),
    ).toBe(false);
  });

  it("treats exactly the threshold as not fast", () => {
    expect(
      isFastSubmission({
        leaseExpiry: EXPIRY,
        leaseMinutes: LEASE_MINUTES,
        thresholdSeconds: 30,
        submittedAt: new Date("2026-01-01T00:00:30.000Z"),
      }),
    ).toBe(false);
  });
});
