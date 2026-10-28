/**
 * Review routing tests.
 */

import { describe, it, expect } from "vitest";
import { routeSubmission, type RoutingSignals } from "../router";

const base: RoutingSignals = {
  modality: "image",
  isFastFlag: false,
  contributorGoldAccuracy: 95,
  contributorTasksCompleted: 20,
};

describe("routeSubmission", () => {
  it("routes video to a human", () => {
    expect(routeSubmission({ ...base, modality: "video" }).route).toBe("human");
  });

  it("routes an eligible image to the AI first pass", () => {
    expect(routeSubmission(base).route).toBe("ai");
  });

  it("routes fast submissions to a human", () => {
    expect(routeSubmission({ ...base, isFastFlag: true }).route).toBe("human");
  });

  it("routes first-time contributors to a human", () => {
    expect(
      routeSubmission({ ...base, contributorTasksCompleted: 0 }).route,
    ).toBe("human");
  });

  it("routes low gold accuracy to a human", () => {
    expect(
      routeSubmission({ ...base, contributorGoldAccuracy: 60 }).route,
    ).toBe("human");
  });

  it("allows an image with unknown gold accuracy and enough tasks to use AI", () => {
    expect(
      routeSubmission({ ...base, contributorGoldAccuracy: null }).route,
    ).toBe("ai");
  });

  it("explains why a submission was sent to a human", () => {
    const decision = routeSubmission({ ...base, isFastFlag: true });
    expect(decision.reasons).toContain("submitted unusually fast");
  });
});
