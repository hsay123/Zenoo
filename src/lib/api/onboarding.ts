/**
 * Onboarding route gate and submit transition.
 *
 * Framework-free on purpose: the route guard component, the chooser and the
 * unit tests all run the same rules, so the "direct URL bypass" and the
 * "Contributor clears the form but never calls the API" bugs are covered by
 * plain logic tests instead of only by a browser.
 */
import { workspaceRoles, type WorkspaceRole } from "@/lib/content/workspace";
import {
  onboardingCompleteResponseSchema,
  platformPaths,
  PlatformError,
  type PlatformClient,
} from "./platform";

export type OnboardingAccountType = "buyer" | "contributor";

/** The single authenticated route an incomplete account may stay on. */
export const ONBOARDING_PATH = "/onboarding";

export function isOnboardingPath(pathname: string): boolean {
  return pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);
}

/** Where a finished account belongs once it leaves the chooser. */
export function workspaceHome(role: WorkspaceRole): string {
  return workspaceRoles[role].home;
}

export type OnboardingGateDecision =
  | { allow: true }
  | { allow: false; redirect: string };

/**
 * Whether the signed-in user is allowed to render `pathname`.
 *
 *  - An account that has not finished onboarding may only see `/onboarding`;
 *    every other URL — `/workspace`, `/workspace/contributor`, any nested
 *    workspace URL — redirects there.
 *  - An account that has finished must never see the chooser again, so
 *    `/onboarding` redirects to its role workspace.
 *
 * Role mismatches *inside* the workspace (a contributor opening the buyer
 * area) are handled separately by `ProductShell`.
 */
export function onboardingGateDecision(input: {
  pathname: string;
  onboardingCompleted: boolean;
  role: WorkspaceRole;
}): OnboardingGateDecision {
  const onOnboarding = isOnboardingPath(input.pathname);

  if (!input.onboardingCompleted) {
    return onOnboarding
      ? { allow: true }
      : { allow: false, redirect: ONBOARDING_PATH };
  }

  return onOnboarding
    ? { allow: false, redirect: workspaceHome(input.role) }
    : { allow: true };
}

/**
 * What selecting an account card should do.
 *
 * A contributor selection has no further input, so it must be submitted to the
 * API immediately; a buyer selection advances to the organization step first.
 * This is the regression point for the bug where selecting Contributor moved
 * to the "submitting" screen without ever issuing the request.
 */
export type SelectionTransition =
  | { kind: "advance-to-org-name" }
  | { kind: "submit"; accountType: "contributor" };

export function describeSelection(accountType: OnboardingAccountType): SelectionTransition {
  return accountType === "buyer"
    ? { kind: "advance-to-org-name" }
    : { kind: "submit", accountType: "contributor" };
}

/**
 * A human-readable problem with an organization name, or `null` when it is
 * acceptable. Pure on purpose: the chooser calls it during render to enable the
 * submit button, and render must never schedule state updates.
 */
export function orgNameIssue(name: string | undefined | null): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Organization name is required";
  if (trimmed.length < 2) return "Organization name must be at least 2 characters";
  if (trimmed.length > 100) return "Organization name must be 100 characters or less";
  return null;
}

export type OnboardingSubmitOutcome =
  | { status: "success"; redirect: string }
  | { status: "error"; message: string };

function onboardingErrorMessage(cause: unknown): string {
  if (cause instanceof PlatformError) {
    return cause.message ? `${cause.code} — ${cause.message}` : cause.code;
  }
  if (cause instanceof Error) return cause.message;
  return "Onboarding could not be completed. Please try again.";
}

export type OnboardingSubmitClient = Pick<PlatformClient, "post">;

/**
 * POST the onboarding choice and map the result to a screen outcome.
 *
 * Success is reported only when the backend confirms `onboarding_completed`
 * and returns a redirect, so the UI can never show the success screen for a
 * write that did not land. Failures are returned (not thrown) so the caller
 * can render an error with a retry.
 */
export async function submitOnboarding(
  client: OnboardingSubmitClient,
  choice: { account_type: OnboardingAccountType; organization_name?: string; wallet_address?: string },
): Promise<OnboardingSubmitOutcome> {
  const organizationName =
    choice.account_type === "buyer" ? choice.organization_name?.trim() : undefined;

  if (choice.account_type === "buyer") {
    const issue = orgNameIssue(organizationName);
    if (issue) return { status: "error", message: issue };
  }

  // Contributors are paid to a wallet, so they must have one (as the backend
  // requires). Buyers may fund by wallet or card, so theirs is optional.
  if (choice.account_type === "contributor" && !choice.wallet_address) {
    return {
      status: "error",
      message: "Your payout wallet is still being set up. Wait a moment and try again.",
    };
  }
  if (choice.wallet_address && !/^0x[0-9a-fA-F]{40}$/.test(choice.wallet_address)) {
    return { status: "error", message: "wallet_address must be a valid Ethereum address (0x...)" };
  }

  try {
    const data = await client.post(
      onboardingCompleteResponseSchema,
      platformPaths.onboardingComplete(),
      {
        body: {
          account_type: choice.account_type,
          ...(organizationName ? { organization_name: organizationName } : {}),
          ...(choice.wallet_address ? { wallet_address: choice.wallet_address } : {}),
        },
      },
    );

    if (data.onboarding_completed && data.redirect) {
      return { status: "success", redirect: data.redirect };
    }
    return {
      status: "error",
      message: "The server did not confirm your onboarding. Please try again.",
    };
  } catch (cause) {
    return { status: "error", message: onboardingErrorMessage(cause) };
  }
}

/**
 * Run an async action at most once at a time. A second call while the first is
 * still in flight resolves to `null` instead of issuing another request, which
 * is what keeps a double click from creating two onboarding writes.
 */
export function createSubmitGuard() {
  let busy = false;
  return {
    get busy(): boolean {
      return busy;
    },
    async run<T>(action: () => Promise<T>): Promise<T | null> {
      if (busy) return null;
      busy = true;
      try {
        return await action();
      } finally {
        busy = false;
      }
    },
  };
}

