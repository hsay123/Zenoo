import { describe, expect, it } from "vitest";
import { apiPlanConfig, applySubscriptionEvent, planFor, type DodoSubscription } from "../apiPlan";
import type { Env } from "@/lib/env";

const PRODUCT = "pdt_api";
const sub = (over: Partial<DodoSubscription> = {}): DodoSubscription => ({
  subscription_id: "sub_1",
  status: "active",
  product_id: PRODUCT,
  metadata: { zeno_org_id: "11111111-1111-4111-8111-111111111111" },
  ...over,
});

describe("API plan", () => {
  it("grants access while active or in the past_due grace period only", () => {
    expect(planFor(sub(), PRODUCT)).toBe("api");
    expect(planFor(sub({ status: "past_due" }), PRODUCT)).toBe("api");
    for (const status of ["on_hold", "cancelled", "expired", "failed", "paused", "pending"]) {
      expect(planFor(sub({ status }), PRODUCT)).toBe("none");
    }
  });

  it("ignores subscriptions for any other product", () => {
    expect(planFor(sub({ product_id: "pdt_other" }), PRODUCT)).toBeNull();
  });

  it("is off unless key, secret and plan product are all configured", () => {
    expect(apiPlanConfig({ DODO_API_KEY: "k", DODO_WEBHOOK_SECRET: "s" } as Env)).toBeNull();
    expect(
      apiPlanConfig({ DODO_API_KEY: "k", DODO_WEBHOOK_SECRET: "s", DODO_API_PLAN_PRODUCT_ID: PRODUCT } as Env),
    ).toMatchObject({ productId: PRODUCT });
  });

  it("re-fetches the subscription and refuses events it cannot attribute", async () => {
    const config = { apiKey: "k", webhookSecret: "s", productId: PRODUCT, baseUrl: "x" };
    const env = {} as Env;
    expect(await applySubscriptionEvent({}, env, { config })).toEqual({
      handled: false,
      reason: "event has no subscription_id",
    });
    const wrongProduct = await applySubscriptionEvent({ subscription_id: "sub_1" }, env, {
      config,
      fetchSubscription: async () => sub({ product_id: "pdt_other" }),
    });
    expect(wrongProduct).toEqual({ handled: false, reason: "subscription is for another product" });
    const noOrg = await applySubscriptionEvent({ subscription_id: "sub_1" }, env, {
      config,
      fetchSubscription: async () => sub({ metadata: {} }),
    });
    expect(noOrg).toEqual({ handled: false, reason: "subscription has no zeno_org_id metadata" });
  });
});
