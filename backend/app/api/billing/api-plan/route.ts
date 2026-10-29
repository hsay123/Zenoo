/**
 * GET /api/billing/api-plan – the buyer organisation's Data API plan.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";
import { organizationOf } from "@/lib/dataapi/keys";
import { API_PLAN_PRICE_USD, apiPlanConfig } from "@/lib/billing/apiPlan";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const { data: org, error } = await getSupabase()
        .from("organizations")
        .select("api_plan, api_plan_status, api_plan_renews_at")
        .eq("id", organizationOf(user))
        .maybeSingle();
      if (error) throw HttpError.internal(`Failed to load the API plan: ${error.message}`);
      return ok({
        plan: (org?.api_plan as string | undefined) ?? "none",
        status: (org?.api_plan_status as string | null) ?? null,
        renews_at: (org?.api_plan_renews_at as string | null) ?? null,
        price_usd: API_PLAN_PRICE_USD,
        interval: "month",
        checkout_available: apiPlanConfig(getEnv()) !== null,
        test_mode: true,
      });
    }),
  );
}
