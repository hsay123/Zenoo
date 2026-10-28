/**
 * Appeals pure-helper tests.
 */

import { describe, it, expect } from "vitest";
import {
  appealDecisionToAppealStatus,
  appealDecisionToStatus,
  assertAppealReasonMatch,
} from "../service";

describe("appealDecisionToStatus", () => {
  it("maps accept (upheld) to accepted and reject (dismissed) to rejected", () => {
    expect(appealDecisionToStatus("accept")).toBe("accepted");
    expect(appealDecisionToStatus("reject")).toBe("rejected");
  });
});

describe("appealDecisionToAppealStatus", () => {
  it("maps to the appeal record status", () => {
    expect(appealDecisionToAppealStatus("accept")).toBe("accepted");
    expect(appealDecisionToAppealStatus("reject")).toBe("rejected");
  });
});

describe("assertAppealReasonMatch", () => {
  it("accepts the matching reason codes", () => {
    expect(() => assertAppealReasonMatch("accept", "APPEAL_UPHELD")).not.toThrow();
    expect(() => assertAppealReasonMatch("reject", "APPEAL_DISMISSED")).not.toThrow();
  });

  it("rejects mismatched reason codes", () => {
    expect(() => assertAppealReasonMatch("accept", "APPEAL_DISMISSED")).toThrow();
    expect(() => assertAppealReasonMatch("reject", "APPEAL_UPHELD")).toThrow();
    expect(() => assertAppealReasonMatch("accept", "LOW_QUALITY")).toThrow();
  });
});