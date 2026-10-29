/**
 * POST /api/payments/dodo/webhook – Dodo Payments webhook (server-to-server).
 *
 * No user auth: the request is authenticated by its Standard Webhooks HMAC
 * signature over the RAW body, with a 5-minute timestamp tolerance. Then:
 *   - a delivery id already processed is acknowledged and ignored;
 *   - `payment.succeeded` is acted on after the payment is re-fetched from
 *     Dodo's API (status, currency, amount, our metadata) before any change;
 *   - the job's escrow is funded by the treasury when it is configured,
 *     otherwise the payment waits as "paid, awaiting funding";
 *   - `subscription.*` events set the organisation's Data API plan, after the
 *     subscription is re-fetched from Dodo's API (lib/billing/apiPlan.ts).
 *
 * A verified delivery is answered 200 even when it changes nothing, so Dodo
 * does not retry it forever; failures are recorded on the payment row and can
 * be retried with POST /api/payments/{id}/fund (admin).
 */

import type { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";
import { dodoWebhookConfig, verifyWebhook } from "@/lib/funding/dodo";
import { applyPaymentSucceeded } from "@/lib/funding/service";
import { applySubscriptionEvent } from "@/lib/billing/apiPlan";

// Treasury funding waits for two Base Sepolia receipts.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const env = getEnv();
  // Job card checkout also needs DODO_PRODUCT_ID; webhooks need only these.
  const config = dodoWebhookConfig(env);
  if (!config) return apiError("NOT_FOUND", "Dodo payments are not enabled", 404);

  const rawBody = await req.text();
  const verification = verifyWebhook(
    config.webhookSecret,
    {
      id: req.headers.get("webhook-id"),
      timestamp: req.headers.get("webhook-timestamp"),
      signature: req.headers.get("webhook-signature"),
    },
    rawBody,
  );
  if (!verification.ok) {
    return apiError("UNAUTHORIZED", verification.reason, 401);
  }

  const supabase = getSupabase();
  const { data: seen } = await supabase
    .from("payment_webhook_events")
    .select("id")
    .eq("id", verification.id)
    .maybeSingle();
  if (seen) return ok({ received: true, duplicate: true });

  let outcome: unknown = { handled: false, reason: `ignored event ${verification.type}` };
  if (verification.type === "payment.succeeded") {
    try {
      outcome = await applyPaymentSucceeded(verification.data, env);
    } catch (cause) {
      // Not recorded as processed, so Dodo's redelivery can try again.
      console.error("[dodo] payment.succeeded handling failed", cause);
      return apiError("INTERNAL_ERROR", "Payment handling failed", 500);
    }
  } else if (verification.type.startsWith("subscription.")) {
    try {
      outcome = await applySubscriptionEvent(verification.data, env);
    } catch (cause) {
      console.error(`[dodo] ${verification.type} handling failed`, cause);
      return apiError("INTERNAL_ERROR", "Subscription handling failed", 500);
    }
  }

  // A handler that is not configured (e.g. DODO_PRODUCT_ID unset) must not
  // consume the delivery: answer 503 unrecorded so Dodo redelivers it later.
  const reason = (outcome as { handled?: boolean; reason?: string }).reason;
  if (reason === "Dodo is not configured" || reason === "API plan is not configured") {
    return apiError("INTERNAL_ERROR", `${verification.type} cannot be handled yet: ${reason}`, 503);
  }

  await supabase
    .from("payment_webhook_events")
    .insert({ id: verification.id, provider: "dodo", event_type: verification.type });

  return ok({ received: true, outcome });
}
