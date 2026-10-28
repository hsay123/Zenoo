/**
 * POST /api/onboarding/complete
 * Persist the user's onboarding choice (buyer/company vs contributor) and
 * return the workspace to redirect to.
 *
 * Auth: required. Only runs once per account; a completed account gets its
 * current state back and can never re-select a role or account type.
 *
 * The write itself is one transactional Postgres function (migration 008), so
 * organization creation + membership + user update cannot half-apply, and
 * concurrent/retried requests are idempotent.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireUser } from "@/lib/auth/requireRole";
import {
  completeOnboarding,
  onboardingBodySchema,
  onboardingRedirect,
} from "@/lib/onboarding/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);

      if (user.onboarding_completed) {
        // Already onboarded — return current state, never allow re-selection.
        return ok({
          onboarding_completed: true,
          account_type: user.onboarding_account_type,
          organization_id: user.organization_id,
          already_completed: true,
          redirect: onboardingRedirect(user.onboarding_account_type),
        });
      }

      const choice = onboardingBodySchema.parse(await readJson(req));
      const result = await completeOnboarding(user.id, choice);

      return ok({
        onboarding_completed: result.onboarding_completed,
        account_type: result.account_type,
        organization_id: result.organization_id,
        redirect: onboardingRedirect(result.account_type),
      });
    }),
  );
}
