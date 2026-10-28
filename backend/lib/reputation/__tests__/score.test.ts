import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  accessForTier,
  claimBlockReason,
  computeReputation,
  type ReputationStats,
} from "../score";

const stats = (s: Partial<ReputationStats> = {}): ReputationStats => ({
  goldPassed: 0,
  goldFailed: 0,
  accepted: 0,
  rejected: 0,
  revised: 0,
  ...s,
});

describe("computeReputation", () => {
  it("starts a brand-new contributor at New with no score", () => {
    const r = computeReputation(stats());
    expect(r).toMatchObject({ tier: "new", earned_tier: "new", score: null, gold_accuracy: null });
    expect(r.next).toEqual({
      tier: "verified",
      needs: ["5 more gold task(s)", "gold accuracy of at least 80%"],
    });
  });

  it("weights gold 60% and acceptance 40%", () => {
    const r = computeReputation(stats({ goldPassed: 9, goldFailed: 1, accepted: 8, rejected: 2 }));
    expect(r.gold_accuracy).toBe(90);
    expect(r.acceptance_rate).toBe(80);
    expect(r.score).toBe(86); // 0.6*90 + 0.4*80
  });

  it("uses whichever signal exists alone", () => {
    expect(computeReputation(stats({ goldPassed: 3, goldFailed: 1 })).score).toBe(75);
    expect(computeReputation(stats({ accepted: 1, revised: 1 })).score).toBe(50);
  });

  it("becomes Verified after enough accurate gold tasks", () => {
    expect(computeReputation(stats({ goldPassed: 4 })).tier).toBe("new"); // too few
    expect(computeReputation(stats({ goldPassed: 4, goldFailed: 2 })).tier).toBe("new"); // 67%
    expect(computeReputation(stats({ goldPassed: 5 })).tier).toBe("verified");
  });

  it("drops back when accuracy falls (tier tracks accuracy)", () => {
    expect(computeReputation(stats({ goldPassed: 8, goldFailed: 1 })).tier).toBe("verified");
    expect(computeReputation(stats({ goldPassed: 8, goldFailed: 4 })).tier).toBe("new");
  });

  it("becomes Trusted with 50 accepted and a score of 85", () => {
    expect(computeReputation(stats({ goldPassed: 10, accepted: 49 })).tier).toBe("verified");
    expect(computeReputation(stats({ goldPassed: 10, accepted: 50 })).tier).toBe("trusted");
    // Enough volume but a weak acceptance rate keeps them Verified.
    const weak = computeReputation(stats({ goldPassed: 10, accepted: 50, rejected: 50 }));
    expect(weak.score).toBe(80);
    expect(weak.tier).toBe("verified");
  });

  it("reaches Reviewer eligibility only at the top thresholds", () => {
    expect(computeReputation(stats({ goldPassed: 20, accepted: 200 })).tier).toBe("reviewer");
    expect(computeReputation(stats({ goldPassed: 20, accepted: 199 })).tier).toBe("trusted");
    expect(computeReputation(stats({ goldPassed: 20, accepted: 200 })).next).toBeNull();
  });

  it("never lets a high acceptance rate skip the gold requirement", () => {
    expect(computeReputation(stats({ accepted: 500 })).tier).toBe("new");
  });

  it("a floor lifts the tier but never lowers it", () => {
    const lifted = computeReputation(stats(), DEFAULT_THRESHOLDS, "trusted");
    expect(lifted).toMatchObject({ tier: "trusted", earned_tier: "new", tier_floor: "trusted" });
    const kept = computeReputation(stats({ goldPassed: 20, accepted: 200 }), DEFAULT_THRESHOLDS, "verified");
    expect(kept.tier).toBe("reviewer");
  });

  it("honours configured thresholds", () => {
    const easy = { ...DEFAULT_THRESHOLDS, verifiedMinGold: 1, trustedMinAccepted: 2, trustedMinScore: 50 };
    expect(computeReputation(stats({ goldPassed: 1, accepted: 2 }), easy).tier).toBe("trusted");
  });
});

describe("task access by tier", () => {
  it("New: gold only, no video", () => {
    expect(accessForTier("new")).toEqual({ goldOnly: true, video: false });
    expect(claimBlockReason("new", { is_gold: false, modality: "image" })).toMatch(/gold/);
    expect(claimBlockReason("new", { is_gold: true, modality: "image" })).toBeNull();
    expect(claimBlockReason("new", { is_gold: true, modality: "video" })).toMatch(/Trusted/);
  });

  it("Verified: paid images, no video", () => {
    expect(claimBlockReason("verified", { is_gold: false, modality: "image" })).toBeNull();
    expect(claimBlockReason("verified", { is_gold: false, modality: "video" })).toMatch(/Trusted/);
  });

  it("Trusted and Reviewer: everything", () => {
    for (const tier of ["trusted", "reviewer"] as const) {
      expect(claimBlockReason(tier, { is_gold: false, modality: "video" })).toBeNull();
      expect(claimBlockReason(tier, { is_gold: false, modality: "image" })).toBeNull();
    }
  });
});
