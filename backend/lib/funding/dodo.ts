/**
 * Dodo Payments (test mode) — checkout creation, payment lookup and webhook
 * verification, over plain `fetch` (no SDK dependency).
 *
 * API: https://docs.dodopayments.com/api-reference/checkout-sessions/create
 * Webhooks follow the Standard Webhooks scheme: HMAC-SHA256 over
 * `${webhook-id}.${webhook-timestamp}.${rawBody}`, keyed by the base64 secret
 * after its `whsec_` prefix, sent as space-separated `v1,<base64>` entries.
 *
 * Only the test host is ever called: real fiat must not move until the audit
 * gate is cleared.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "@/lib/env";

export const DODO_TEST_BASE_URL = "https://test.dodopayments.com";

/** Webhooks older or newer than this are rejected (Standard Webhooks default). */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface DodoConfig {
  apiKey: string;
  webhookSecret: string;
  productId: string;
  baseUrl: string;
}

/** The card/UPI option exists only when every Dodo setting is present. */
export function dodoConfig(env: Env): DodoConfig | null {
  const apiKey = (env.DODO_API_KEY ?? "").trim();
  const webhookSecret = (env.DODO_WEBHOOK_SECRET ?? "").trim();
  const productId = (env.DODO_PRODUCT_ID ?? "").trim();
  if (!apiKey || !webhookSecret || !productId) return null;
  return { apiKey, webhookSecret, productId, baseUrl: DODO_TEST_BASE_URL };
}

/**
 * Webhooks and the API plan need only the API key and the signing secret; the
 * job-funding product is required only for card checkout of a job.
 */
export function dodoWebhookConfig(env: Env): { apiKey: string; webhookSecret: string } | null {
  const apiKey = (env.DODO_API_KEY ?? "").trim();
  const webhookSecret = (env.DODO_WEBHOOK_SECRET ?? "").trim();
  return apiKey && webhookSecret ? { apiKey, webhookSecret } : null;
}

type FetchLike = typeof fetch;

export async function dodoRequest<T>(
  config: DodoConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const response = await fetchImpl(`${config.baseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  if (!response.ok) {
    // Never echo the request (it carries the API key in a header, not the body,
    // but keep the error short and provider-side only).
    throw new Error(`Dodo ${init.method} ${path} failed: ${response.status} ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export interface CreateCheckoutInput {
  amountCents: number;
  metadata: Record<string, string>;
  returnUrl: string;
  customerEmail?: string | null;
}

export async function createCheckout(
  config: DodoConfig,
  input: CreateCheckoutInput,
  fetchImpl?: FetchLike,
): Promise<{ session_id: string; checkout_url: string }> {
  const body: Record<string, unknown> = {
    // A pay-what-you-want product; `amount` overrides its price (cents).
    product_cart: [{ product_id: config.productId, quantity: 1, amount: input.amountCents }],
    metadata: input.metadata,
    return_url: input.returnUrl,
  };
  if (input.customerEmail) body.customer = { email: input.customerEmail };

  const result = await dodoRequest<{ session_id: string; checkout_url: string | null }>(
    config,
    "/checkouts",
    { method: "POST", body },
    fetchImpl,
  );
  if (!result.session_id || !result.checkout_url) {
    throw new Error("Dodo did not return a checkout URL");
  }
  return { session_id: result.session_id, checkout_url: result.checkout_url };
}

/** The Payment fields Zeno relies on (subset of Dodo's PaymentResponse). */
export interface DodoPayment {
  payment_id: string;
  status: string | null;
  total_amount: number;
  currency: string;
  metadata: Record<string, unknown>;
  checkout_session_id?: string | null;
}

export function getPayment(
  config: DodoConfig,
  paymentId: string,
  fetchImpl?: FetchLike,
): Promise<DodoPayment> {
  return dodoRequest<DodoPayment>(
    config,
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
    fetchImpl,
  );
}

export type WebhookVerification =
  | { ok: true; id: string; type: string; data: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Verify a webhook delivery against the raw request body. Pure apart from the
 * clock, which is injectable for tests.
 */
export function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): WebhookVerification {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing webhook headers" };
  if (!/^\d+$/.test(timestamp)) return { ok: false, reason: "invalid webhook timestamp" };
  if (Math.abs(nowSeconds - parseInt(timestamp, 10)) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "webhook timestamp outside tolerance" };
  }

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return { ok: false, reason: "webhook secret is empty" };
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  const matches = signature
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .some((entry) => {
      const given = Buffer.from(entry.slice(3), "base64");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  if (!matches) return { ok: false, reason: "invalid webhook signature" };

  let parsed: { type?: unknown; data?: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "webhook body is not JSON" };
  }
  if (typeof parsed.type !== "string" || !parsed.data || typeof parsed.data !== "object") {
    return { ok: false, reason: "webhook body has no type/data" };
  }
  return { ok: true, id, type: parsed.type, data: parsed.data as Record<string, unknown> };
}
