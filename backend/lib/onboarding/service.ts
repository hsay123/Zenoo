/**
 * First-time onboarding.
 *
 * The persisted choice and account creation live in the
 * `complete_onboarding(...)` Postgres function (migration 008) so organization
 * creation, membership and the user update happen in one transaction and are
 * safe under retries and concurrent calls. This module owns request validation
 * and the mapping from the RPC result / errors to the HTTP layer.
 */

import { z } from "zod";
import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";

export const ONBOARDING_ACCOUNT_TYPES = ["buyer", "contributor"] as const;
export type OnboardingAccountType = (typeof ONBOARDING_ACCOUNT_TYPES)[number];

/**
 * Body for POST /api/onboarding/complete.
 *
 * Only `buyer` and `contributor` are self-selectable. `reviewer` and `admin`
 * are admin-controlled and are intentionally not accepted here: a public user
 * cannot escalate their own role.
 */
export const onboardingBodySchema = z
  .object({
    account_type: z.enum(ONBOARDING_ACCOUNT_TYPES),
    organization_name: z.string().trim().min(1).max(100).optional(),
    wallet_address: z.string().trim().optional().refine(
      (v) => !v || /^0x[0-9a-fA-F]{40}$/.test(v),
      "wallet_address must be a 0x-prefixed Ethereum address",
    ),
  })
  .superRefine((value, ctx) => {
    if (value.account_type === "buyer" && !value.organization_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organization_name"],
        message: "organization_name is required for a company account",
      });
    }
    // Contributors must provide a verified payout wallet
    if (value.account_type === "contributor" && !value.wallet_address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wallet_address"],
        message: "wallet_address is required for contributor payouts",
      });
    }
  });

export type OnboardingChoice = z.infer<typeof onboardingBodySchema>;

export interface OnboardingResult {
  onboarding_completed: boolean;
  account_type: OnboardingAccountType | null;
  organization_id: string | null;
  already_completed: boolean;
}

/** Where a user goes once onboarding resolves. */
export function onboardingRedirect(accountType: OnboardingAccountType | null): string {
  return accountType === "buyer" ? "/workspace/buyer" : "/workspace/contributor";
}

/** Normalise the raw JSONB returned by the RPC into a typed result. */
export function toOnboardingResult(raw: unknown): OnboardingResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  const accountType = row.account_type;
  return {
    onboarding_completed: row.onboarding_completed === true,
    account_type:
      accountType === "buyer" || accountType === "contributor" ? accountType : null,
    organization_id: typeof row.organization_id === "string" ? row.organization_id : null,
    already_completed: row.already_completed === true,
  };
}

export interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/**
 * Map a Postgres/PostgREST error from `complete_onboarding` to an HTTP error.
 * The function raises SQLSTATE 22023 for invalid input and P0002 for a missing
 * user; anything else is treated as a server error (never silently swallowed).
 */
export function mapOnboardingRpcError(error: PostgrestLikeError): HttpError {
  if (error.code === "22023") {
    return HttpError.unprocessable(error.message ?? "Invalid onboarding input");
  }
  if (error.code === "P0002") {
    return HttpError.notFound("User not found");
  }
  return HttpError.internal(
    `Failed to complete onboarding: ${error.message ?? "unknown error"}`,
  );
}

export async function completeOnboarding(
  userId: string,
  choice: OnboardingChoice,
): Promise<OnboardingResult> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_user_id: userId,
    p_account_type: choice.account_type,
    p_org_name: choice.organization_name ?? null,
    p_wallet_address: choice.wallet_address ?? null,
  });

  if (error) throw mapOnboardingRpcError(error as PostgrestLikeError);

  return toOnboardingResult(data);
}
