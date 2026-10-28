/**
 * Onboarding validation and result-mapping tests (no live DB).
 */

import { describe, it, expect } from "vitest";
import {
  onboardingBodySchema,
  onboardingRedirect,
  toOnboardingResult,
  mapOnboardingRpcError,
} from "../service";

describe("onboardingBodySchema", () => {
  it("accepts a contributor choice", () => {
    const parsed = onboardingBodySchema.parse({ account_type: "contributor" });
    expect(parsed.account_type).toBe("contributor");
  });

  it("accepts a buyer choice with an organization name", () => {
    const parsed = onboardingBodySchema.parse({
      account_type: "buyer",
      organization_name: "  Acme Robotics  ",
    });
    expect(parsed.organization_name).toBe("Acme Robotics");
  });

  it("requires an organization name for a buyer", () => {
    expect(onboardingBodySchema.safeParse({ account_type: "buyer" }).success).toBe(false);
    expect(
      onboardingBodySchema.safeParse({ account_type: "buyer", organization_name: "   " })
        .success,
    ).toBe(false);
  });

  it("rejects self-selected reviewer and admin roles", () => {
    for (const account_type of ["reviewer", "admin"]) {
      expect(onboardingBodySchema.safeParse({ account_type }).success).toBe(false);
    }
  });

  it("rejects an unknown account type", () => {
    expect(onboardingBodySchema.safeParse({ account_type: "owner" }).success).toBe(false);
  });

  it("caps the organization name length", () => {
    expect(
      onboardingBodySchema.safeParse({
        account_type: "buyer",
        organization_name: "x".repeat(101),
      }).success,
    ).toBe(false);
  });
});

describe("onboardingRedirect", () => {
  it("routes buyers and contributors to their workspaces", () => {
    expect(onboardingRedirect("buyer")).toBe("/workspace/buyer");
    expect(onboardingRedirect("contributor")).toBe("/workspace/contributor");
    expect(onboardingRedirect(null)).toBe("/workspace/contributor");
  });
});

describe("toOnboardingResult", () => {
  it("normalises a buyer result", () => {
    expect(
      toOnboardingResult({
        onboarding_completed: true,
        account_type: "buyer",
        organization_id: "11111111-1111-4111-8111-111111111111",
        already_completed: false,
      }),
    ).toEqual({
      onboarding_completed: true,
      account_type: "buyer",
      organization_id: "11111111-1111-4111-8111-111111111111",
      already_completed: false,
    });
  });

  it("treats unknown account types and missing fields as null/false", () => {
    expect(toOnboardingResult({ account_type: "admin" })).toEqual({
      onboarding_completed: false,
      account_type: null,
      organization_id: null,
      already_completed: false,
    });
    expect(toOnboardingResult(null)).toEqual({
      onboarding_completed: false,
      account_type: null,
      organization_id: null,
      already_completed: false,
    });
  });
});

describe("mapOnboardingRpcError", () => {
  it("maps invalid input to 422", () => {
    const err = mapOnboardingRpcError({ code: "22023", message: "bad input" });
    expect(err.status).toBe(422);
    expect(err.message).toBe("bad input");
  });

  it("maps a missing user to 404", () => {
    expect(mapOnboardingRpcError({ code: "P0002" }).status).toBe(404);
  });

  it("maps anything else to a non-swallowed 500", () => {
    const err = mapOnboardingRpcError({ code: "XX000", message: "boom" });
    expect(err.status).toBe(500);
    expect(err.message).toContain("boom");
  });
});
