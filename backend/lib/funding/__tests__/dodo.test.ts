import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  DODO_TEST_BASE_URL,
  createCheckout,
  dodoConfig,
  verifyWebhook,
  type DodoConfig,
} from "../dodo";
import type { Env } from "@/lib/env";

const KEY = Buffer.from("test-signing-key-32-bytes-long!!");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = 1_800_000_000;
const BODY = JSON.stringify({
  business_id: "bus_1",
  type: "payment.succeeded",
  timestamp: "2026-10-29T00:00:00Z",
  data: { payload_type: "Payment", payment_id: "pay_1", total_amount: 500 },
});

function sign(id: string, ts: number, body: string, key: Buffer = KEY) {
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

const headers = (overrides: Partial<{ id: string | null; timestamp: string | null; signature: string | null }> = {}) => ({
  id: "msg_1",
  timestamp: String(NOW),
  signature: sign("msg_1", NOW, BODY),
  ...overrides,
});

describe("verifyWebhook", () => {
  it("accepts a correctly signed delivery and returns type and data", () => {
    const result = verifyWebhook(SECRET, headers(), BODY, NOW);
    expect(result).toEqual({
      ok: true,
      id: "msg_1",
      type: "payment.succeeded",
      data: { payload_type: "Payment", payment_id: "pay_1", total_amount: 500 },
    });
  });

  it("accepts when any one of several space-separated signatures matches", () => {
    const signature = `v1,${Buffer.from("nope").toString("base64")} ${sign("msg_1", NOW, BODY)}`;
    expect(verifyWebhook(SECRET, headers({ signature }), BODY, NOW).ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = BODY.replace("500", "50000");
    expect(verifyWebhook(SECRET, headers(), tampered, NOW)).toEqual({
      ok: false,
      reason: "invalid webhook signature",
    });
  });

  it("rejects a signature made with a different secret", () => {
    const signature = sign("msg_1", NOW, BODY, Buffer.from("another-key-entirely-different!!"));
    expect(verifyWebhook(SECRET, headers({ signature }), BODY, NOW).ok).toBe(false);
  });

  it("rejects a replayed id/timestamp pair (signature binds both)", () => {
    expect(verifyWebhook(SECRET, headers({ id: "msg_2" }), BODY, NOW).ok).toBe(false);
  });

  it("rejects stale or future timestamps beyond 5 minutes", () => {
    const old = NOW - 301;
    expect(
      verifyWebhook(SECRET, headers({ timestamp: String(old), signature: sign("msg_1", old, BODY) }), BODY, NOW),
    ).toEqual({ ok: false, reason: "webhook timestamp outside tolerance" });
    const future = NOW + 301;
    expect(
      verifyWebhook(SECRET, headers({ timestamp: String(future), signature: sign("msg_1", future, BODY) }), BODY, NOW).ok,
    ).toBe(false);
  });

  it("rejects missing headers and non-v1 schemes", () => {
    expect(verifyWebhook(SECRET, headers({ signature: null }), BODY, NOW).ok).toBe(false);
    expect(verifyWebhook(SECRET, headers({ id: null }), BODY, NOW).ok).toBe(false);
    const v2 = sign("msg_1", NOW, BODY).replace("v1,", "v2,");
    expect(verifyWebhook(SECRET, headers({ signature: v2 }), BODY, NOW).ok).toBe(false);
  });

  it("rejects a signed body without type/data", () => {
    const body = JSON.stringify({ hello: "world" });
    const result = verifyWebhook(SECRET, headers({ signature: sign("msg_1", NOW, body) }), body, NOW);
    expect(result.ok).toBe(false);
  });
});

describe("dodoConfig", () => {
  it("is enabled only when key, secret and product are all set, and always uses the test host", () => {
    const full = { DODO_API_KEY: "k", DODO_WEBHOOK_SECRET: "s", DODO_PRODUCT_ID: "p" } as Env;
    expect(dodoConfig(full)?.baseUrl).toBe(DODO_TEST_BASE_URL);
    expect(dodoConfig({ ...full, DODO_PRODUCT_ID: "" } as Env)).toBeNull();
    expect(dodoConfig({} as Env)).toBeNull();
  });
});

describe("createCheckout", () => {
  const config: DodoConfig = {
    apiKey: "sk_test",
    webhookSecret: SECRET,
    productId: "pdt_pwyw",
    baseUrl: DODO_TEST_BASE_URL,
  };

  it("posts a pay-what-you-want cart with the amount override and metadata", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ session_id: "cks_1", checkout_url: "https://checkout" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = await createCheckout(
      config,
      {
        amountCents: 500,
        metadata: { zeno_payment_id: "p1", job_id: "j1" },
        returnUrl: "https://localhost:3000/x",
        customerEmail: "buyer@example.com",
      },
      fakeFetch,
    );

    expect(result).toEqual({ session_id: "cks_1", checkout_url: "https://checkout" });
    expect(seen!.url).toBe("https://test.dodopayments.com/checkouts");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test");
    expect(JSON.parse(String(seen!.init.body))).toEqual({
      product_cart: [{ product_id: "pdt_pwyw", quantity: 1, amount: 500 }],
      metadata: { zeno_payment_id: "p1", job_id: "j1" },
      return_url: "https://localhost:3000/x",
      customer: { email: "buyer@example.com" },
    });
  });

  it("throws on an API error without a checkout URL", async () => {
    const failing = (async () => new Response("bad", { status: 422 })) as unknown as typeof fetch;
    await expect(
      createCheckout(config, { amountCents: 1, metadata: {}, returnUrl: "x" }, failing),
    ).rejects.toThrow(/422/);
  });
});
