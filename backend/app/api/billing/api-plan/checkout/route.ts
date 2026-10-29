/**
 * POST /api/billing/api-plan/checkout – start a Dodo Payments (TEST MODE)
 * checkout for the $299/month Data API plan. The plan switches on when the
 * signed `subscription.active` webhook arrives, never from this call.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";
import { organizationOf } from "@/lib/dataapi/keys";
import { apiPlanConfig, createApiPlanCheckout } from "@/lib/billing/apiPlan";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const organizationId = organizationOf(user);
      const env = getEnv();
      const config = apiPlanConfig(env);
      if (!config) throw HttpError.conflict("The API plan checkout is not configured");

      const { data: org } = await getSupabase()
        .from("organizations")
        .select("api_plan")
        .eq("id", organizationId)
        .maybeSingle();
      if (org?.api_plan === "api") throw HttpError.conflict("Your organization already has the API plan");

      const checkout = await createApiPlanCheckout(config, {
        organizationId,
        userId: user.id,
        email: user.email,
        returnUrl: `${env.FRONTEND_ORIGIN.replace(/\/+$/, "")}/workspace/buyer/api?checkout=done`,
      });
      return ok({ checkout_url: checkout.checkout_url });
    }),
  );
}
