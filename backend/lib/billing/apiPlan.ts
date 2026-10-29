/**
 * The Data API plan: a $299/month Dodo Payments subscription, test mode only
 * (docs/system/DATA-API.md §5).
 *
 * Checkout carries the organisation id in metadata. On every `subscription.*`
 * webhook the subscription is re-fetched from Dodo's API (status, product,
 * metadata) before the organisation's plan changes, so a forged or stale
 * payload can never switch the API on.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { Env } from "@/lib/env";
import { DODO_TEST_BASE_URL, dodoRequest, type DodoConfig } from "@/lib/funding/dodo";

export const API_PLAN_PRICE_USD = 299;

/** Statuses that keep API access on. `past_due` is Dodo's grace period. */
const ACCESS_STATUSES = new Set(["active", "past_due"]);

export type ApiPlanConfig = DodoConfig;

export function apiPlanConfig(env: Env): ApiPlanConfig | null {
  const apiKey = (env.DODO_API_KEY ?? "").trim();
  const webhookSecret = (env.DODO_WEBHOOK_SECRET ?? "").trim();
  const productId = (env.DODO_API_PLAN_PRODUCT_ID ?? "").trim();
  if (!apiKey || !webhookSecret || !productId) return null;
  return { apiKey, webhookSecret, productId, baseUrl: DODO_TEST_BASE_URL };
}

export interface DodoSubscription {
  subscription_id: string;
  status: string;
  product_id: string;
  metadata: Record<string, unknown> | null;
  next_billing_date?: string | null;
}

export async function createApiPlanCheckout(
  config: ApiPlanConfig,
  input: { organizationId: string; userId: string; email?: string | null; returnUrl: string },
  fetchImpl?: typeof fetch,
): Promise<{ session_id: string; checkout_url: string }> {
  const body: Record<string, unknown> = {
    product_cart: [{ product_id: config.productId, quantity: 1 }],
    metadata: { zeno_org_id: input.organizationId, zeno_user_id: input.userId, zeno_purpose: "api_plan" },
    return_url: input.returnUrl,
  };
  if (input.email) body.customer = { email: input.email };
  const result = await dodoRequest<{ session_id: string; checkout_url: string | null }>(
    config,
    "/checkouts",
    { method: "POST", body },
    fetchImpl,
  );
  if (!result.session_id || !result.checkout_url) throw new Error("Dodo did not return a checkout URL");
  return { session_id: result.session_id, checkout_url: result.checkout_url };
}

export function getSubscription(
  config: ApiPlanConfig,
  subscriptionId: string,
  fetchImpl?: typeof fetch,
): Promise<DodoSubscription> {
  return dodoRequest<DodoSubscription>(
    config,
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
    fetchImpl,
  );
}

export type PlanOutcome =
  | { handled: true; organization_id: string; api_plan: "api" | "none"; status: string }
  | { handled: false; reason: string };

/** The plan an organisation should have for a verified subscription. */
export function planFor(subscription: DodoSubscription, productId: string): "api" | "none" | null {
  if (subscription.product_id !== productId) return null;
  return ACCESS_STATUSES.has(subscription.status) ? "api" : "none";
}

export async function applySubscriptionEvent(
  data: Record<string, unknown>,
  env: Env,
  deps: { config?: ApiPlanConfig | null; fetchSubscription?: typeof getSubscription } = {},
): Promise<PlanOutcome> {
  const config = deps.config === undefined ? apiPlanConfig(env) : deps.config;
  if (!config) return { handled: false, reason: "API plan is not configured" };

  const subscriptionId = typeof data.subscription_id === "string" ? data.subscription_id : "";
  if (!subscriptionId) return { handled: false, reason: "event has no subscription_id" };

  const subscription = await (deps.fetchSubscription ?? getSubscription)(config, subscriptionId);
  const plan = planFor(subscription, config.productId);
  if (plan === null) return { handled: false, reason: "subscription is for another product" };
  const organizationId =
    typeof subscription.metadata?.zeno_org_id === "string" ? subscription.metadata.zeno_org_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    return { handled: false, reason: "subscription has no zeno_org_id metadata" };
  }

  const { data: org, error: loadError } = await getSupabase()
    .from("organizations")
    .select("id, api_plan, api_plan_subscription_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (loadError) throw HttpError.internal(`Failed to load organization: ${loadError.message}`);
  if (!org) return { handled: false, reason: "unknown organization" };
  // A stale event for an older subscription must not end a newer one's access.
  if (plan === "none" && org.api_plan_subscription_id && org.api_plan_subscription_id !== subscriptionId) {
    return { handled: false, reason: "event is for a replaced subscription" };
  }

  const { error } = await getSupabase()
    .from("organizations")
    .update({
      api_plan: plan,
      api_plan_subscription_id: subscriptionId,
      api_plan_status: subscription.status,
      api_plan_renews_at: subscription.next_billing_date ?? null,
      api_plan_updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);
  if (error) throw HttpError.internal(`Failed to update the API plan: ${error.message}`);
  return { handled: true, organization_id: organizationId, api_plan: plan, status: subscription.status };
}
