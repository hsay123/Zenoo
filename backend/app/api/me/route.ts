/**
 * GET /api/me
 * Returns the authenticated user plus a contributor-profile summary.
 * Auth: required. Roles: all.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireUser } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import type { CurrentUser, MeProfile } from "@/src/types/api";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);

      const supabase = getSupabase();
      const { data: profile, error } = await supabase
        .from("contributor_profiles")
        .select("qualification_passed, tasks_completed, gold_accuracy")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(`Failed to load profile: ${error.message}`);

      const body: CurrentUser = {
        id: user.id,
        wallet_address: user.wallet_address,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
        onboarding_completed: user.onboarding_completed,
        onboarding_account_type: user.onboarding_account_type,
        organization_id: user.organization_id,
        profile: (profile as MeProfile | null) ?? null,
      };
      return ok(body);
    }),
  );
}
