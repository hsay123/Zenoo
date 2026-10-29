/**
 * viaSocket event hook tests (fake fetch — no live viaSocket needed).
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sendEvent, signBody, viaSocketConfig, type ZenoEvent } from "../viasocket";

const event: ZenoEvent = {
  event: "payout.settled",
  occurred_at: "2026-10-29T00:00:00.000Z",
  chain_id: 84532,
  data: { receipt_id: "r1", amount_usdc: "0.04", is_mock: false },
};

describe("viaSocketConfig", () => {
  it("is off without a webhook URL", () => {
    expect(viaSocketConfig({})).toBeNull();
    expect(viaSocketConfig({ VIASOCKET_WEBHOOK_URL: "  " })).toBeNull();
  });

  it("keeps the secret only when set", () => {
    expect(viaSocketConfig({ VIASOCKET_WEBHOOK_URL: "https://hooks.example.test/zeno" })).toEqual({
      url: "https://hooks.example.test/zeno",
    });
    expect(
      viaSocketConfig({ VIASOCKET_WEBHOOK_URL: "https://hooks.example.test/zeno", VIASOCKET_WEBHOOK_SECRET: "s" }),
    ).toEqual({ url: "https://hooks.example.test/zeno", secret: "s" });
  });
});

describe("sendEvent", () => {
  it("posts the event as JSON with an HMAC signature", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const ok = await sendEvent({ url: "https://hook.test/x", secret: "shh" }, event, fakeFetch);
    expect(ok).toBe(true);
    expect(seen!.url).toBe("https://hook.test/x");
    const body = seen!.init.body as string;
    expect(JSON.parse(body)).toEqual(event);
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers["x-zeno-signature"]).toBe(
      `sha256=${createHmac("sha256", "shh").update(body).digest("hex")}`,
    );
    expect(signBody(body, "shh")).toBe(headers["x-zeno-signature"]);
  });

  it("sends no signature without a secret", async () => {
    let headers: Record<string, string> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return new Response("ok");
    }) as unknown as typeof fetch;
    await sendEvent({ url: "https://hook.test/x" }, event, fakeFetch);
    expect(headers["x-zeno-signature"]).toBeUndefined();
  });

  it("never throws: HTTP errors and network errors resolve to false", async () => {
    const failing = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    const throwing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(sendEvent({ url: "https://hook.test/x" }, event, failing)).resolves.toBe(false);
    await expect(sendEvent({ url: "https://hook.test/x" }, event, throwing)).resolves.toBe(false);
  });
});
