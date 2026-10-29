import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATH,
  createSubmitGuard,
  describeSelection,
  isOnboardingPath,
  onboardingGateDecision,
  orgNameIssue,
  submitOnboarding,
  type OnboardingSubmitClient,
} from "./onboarding";
import { PlatformError } from "./platform";

function fakeClient(response: unknown) {
  const calls: Array<{ path: string; body: unknown }> = [];
  const client = {
    async post(_schema: unknown, path: string, opts?: { body?: unknown }) {
      calls.push({ path, body: opts?.body });
      return response;
    },
  } as unknown as OnboardingSubmitClient;
  return { client, calls };
}

/**
 * Regression for the direct-route bypass: onboarding status must gate every
 * protected workspace URL, not only `/workspace`.
 */
describe("onboardingGateDecision", () => {
  const incomplete = { onboardingCompleted: false, role: "contributor" } as const;

  it("sends an incomplete account from any workspace URL to /onboarding", () => {
    for (const pathname of [
      "/workspace",
      "/workspace/contributor",
      "/workspace/contributor/submissions",
      "/workspace/buyer",
      "/workspace/buyer/new",
      "/workspace/buyer/jobs/abc/export",
      "/workspace/buyer/jobs/1/export",
      "/workspace/reviewer/review/1",
      "/workspace/admin",
    ]) {
      expect(onboardingGateDecision({ pathname, ...incomplete })).toEqual({
        allow: false,
        redirect: ONBOARDING_PATH,
      });
    }
  });

  it("keeps /onboarding reachable for an incomplete account (no loop)", () => {
    expect(onboardingGateDecision({ pathname: "/onboarding", ...incomplete })).toEqual({
      allow: true,
    });
    expect(onboardingGateDecision({ pathname: "/onboarding/details", ...incomplete })).toEqual({
      allow: true,
    });
  });

  it("never shows /onboarding again once onboarding is complete", () => {
    const cases = [
      ["contributor", "/workspace/contributor"],
      ["buyer", "/workspace/buyer"],
      ["reviewer", "/workspace/reviewer"],
      ["admin", "/workspace/admin"],
    ] as const;
    for (const [role, home] of cases) {
      expect(
        onboardingGateDecision({
          pathname: "/onboarding",
          onboardingCompleted: true,
          role,
        }),
      ).toEqual({ allow: false, redirect: home });
    }
  });

  it("lets a completed account through the workspace", () => {
    expect(
      onboardingGateDecision({
        pathname: "/workspace/contributor",
        onboardingCompleted: true,
        role: "contributor",
      }),
    ).toEqual({ allow: true });
    expect(
      onboardingGateDecision({
        pathname: "/workspace/buyer/jobs/1",
        onboardingCompleted: true,
        role: "buyer",
      }),
    ).toEqual({ allow: true });
  });

  it("recognises the onboarding path and its children only", () => {
    expect(isOnboardingPath("/onboarding")).toBe(true);
    expect(isOnboardingPath("/onboarding/step")).toBe(true);
    expect(isOnboardingPath("/workspace")).toBe(false);
    expect(isOnboardingPath("/onboarding-elsewhere")).toBe(false);
  });
});

/**
 * Regression for the Contributor defect: selecting Contributor used to move to
 * the "submitting" screen without ever issuing the request.
 */
describe("describeSelection", () => {
  it("submits contributor immediately", () => {
    expect(describeSelection("contributor")).toEqual({
      kind: "submit",
      accountType: "contributor",
    });
  });

  it("advances buyer to the organization step", () => {
    expect(describeSelection("buyer")).toEqual({ kind: "advance-to-org-name" });
  });
});

/**
 * The organization-name check must be pure: the buyer step calls it during
 * render to enable the submit button. Scheduling state from it used to throw
 * "Too many re-renders" and crash the step.
 */
describe("orgNameIssue", () => {
  it("requires a non-empty name", () => {
    expect(orgNameIssue("")).toBe("Organization name is required");
    expect(orgNameIssue("   ")).toBe("Organization name is required");
    expect(orgNameIssue(undefined)).toBe("Organization name is required");
  });

  it("requires at least two characters", () => {
    expect(orgNameIssue("A")).toBe("Organization name must be at least 2 characters");
  });

  it("caps at 100 characters", () => {
    expect(orgNameIssue("x".repeat(101))).toBe(
      "Organization name must be 100 characters or less",
    );
  });

  it("accepts a real name and returns no error", () => {
    expect(orgNameIssue("Acme AI")).toBeNull();
    expect(orgNameIssue("  Acme AI  ")).toBeNull();
  });
});

describe("submitOnboarding", () => {
  it("POSTs the contributor choice and returns the confirmed redirect", async () => {
    const { client, calls } = fakeClient({
      onboarding_completed: true,
      redirect: "/workspace/contributor",
    });
    const result = await submitOnboarding(client, { 
      account_type: "contributor",
      wallet_address: "0x1234567890123456789012345678901234567890",
    });
    expect(result).toEqual({ status: "success", redirect: "/workspace/contributor" });
    expect(calls).toEqual([
      { path: "/api/onboarding/complete", body: { account_type: "contributor", wallet_address: "0x1234567890123456789012345678901234567890" } },
    ]);
  });

  it("sends the trimmed organization name and wallet address for a buyer", async () => {
    const { client, calls } = fakeClient({
      onboarding_completed: true,
      redirect: "/workspace/buyer",
    });
    const result = await submitOnboarding(client, {
      account_type: "buyer",
      organization_name: "  Acme AI  ",
      wallet_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });
    expect(result).toEqual({ status: "success", redirect: "/workspace/buyer" });
    expect(calls[0].body).toEqual({
      account_type: "buyer",
      organization_name: "Acme AI",
      wallet_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });
  });

  it("refuses a buyer with no organization name without sending a request", async () => {
    const { client, calls } = fakeClient({
      onboarding_completed: true,
      redirect: "/workspace/buyer",
    });
    const result = await submitOnboarding(client, {
      account_type: "buyer",
      organization_name: "   ",
      wallet_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });
    expect(result).toEqual({ status: "error", message: "Organization name is required" });
    expect(calls).toHaveLength(0);
  });

  it("submits a buyer without a wallet address (buyers may fund by card)", async () => {
    const { client, calls } = fakeClient({
      onboarding_completed: true,
      redirect: "/workspace/buyer",
    });
    const result = await submitOnboarding(client, {
      account_type: "buyer",
      organization_name: "Acme AI",
      wallet_address: "",
    });
    expect(result).toEqual({ status: "success", redirect: "/workspace/buyer" });
    expect(calls).toEqual([
      { path: "/api/onboarding/complete", body: { account_type: "buyer", organization_name: "Acme AI" } },
    ]);
  });

  it("refuses a contributor with no wallet address without sending a request", async () => {
    const { client, calls } = fakeClient({
      onboarding_completed: true,
      redirect: "/workspace/contributor",
    });
    const result = await submitOnboarding(client, {
      account_type: "contributor",
      wallet_address: "",
    });
    expect(result).toEqual({
      status: "error",
      message: "Your payout wallet is still being set up. Wait a moment and try again.",
    });
    expect(calls).toHaveLength(0);
  });

  it("refuses a contributor with invalid wallet address without sending a request", async () => {
    const { client, calls } = fakeClient({
      onboarding_completed: true,
      redirect: "/workspace/contributor",
    });
    const result = await submitOnboarding(client, {
      account_type: "contributor",
      wallet_address: "invalid",
    });
    expect(result).toEqual({
      status: "error",
      message: "wallet_address must be a valid Ethereum address (0x...)",
    });
    expect(calls).toHaveLength(0);
  });

  it("never reports success when the backend does not confirm it", async () => {
    const { client } = fakeClient({
      onboarding_completed: false,
      redirect: "/workspace/contributor",
    });
    const result = await submitOnboarding(client, { 
      account_type: "contributor",
      wallet_address: "0x1234567890123456789012345678901234567890",
    });
    expect(result.status).toBe("error");
  });

  it("surfaces a platform failure with its code so the user can retry", async () => {
    const client = {
      async post(): Promise<never> {
        throw new PlatformError("VALIDATION", "organization_name is required");
      },
    } as unknown as OnboardingSubmitClient;
    const result = await submitOnboarding(client, {
      account_type: "buyer",
      organization_name: "Acme AI",
      wallet_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });
    expect(result).toEqual({
      status: "error",
      message: "VALIDATION — organization_name is required",
    });
  });
});

describe("createSubmitGuard", () => {
  it("runs one action at a time, dropping a concurrent second call", async () => {
    let calls = 0;
    let release: (() => void) | null = null;
    const guard = createSubmitGuard();
    const action = async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return "done";
    };

    const first = guard.run(action);
    expect(guard.busy).toBe(true);
    const second = guard.run(action);
    expect(calls).toBe(1);

    release!();
    await expect(first).resolves.toBe("done");
    await expect(second).resolves.toBeNull();
    expect(calls).toBe(1);
    expect(guard.busy).toBe(false);
  });

  it("allows a retry once the in-flight action settles", async () => {
    let calls = 0;
    const guard = createSubmitGuard();
    const action = async () => {
      calls += 1;
      return calls;
    };
    await expect(guard.run(action)).resolves.toBe(1);
    await expect(guard.run(action)).resolves.toBe(2);
    expect(calls).toBe(2);
    expect(guard.busy).toBe(false);
  });
});