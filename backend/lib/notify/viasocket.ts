/**
 * viaSocket event hook (HHG sponsor integration).
 *
 * Posts Zeno's key events to a viaSocket flow's webhook trigger, so the flow
 * can fan them out (Slack, Discord, Gmail, Sheets, ...) without Zeno holding
 * any third-party credentials. Opt-in: a no-op unless VIASOCKET_WEBHOOK_URL is
 * set. Fire-and-forget after the response; a failure is logged, never thrown,
 * so it cannot block or fail a payment, review or payout. Plain fetch, no SDK.
 *
 * Payloads carry ids, statuses and amounts only (no emails, names or keys).
 */

import { createHmac } from "node:crypto";
import { after } from "next/server";
import { getEnv } from "@/lib/env";
import { deliverAppAlerts, viasocketConfigured } from "@/lib/notify/apps";

export type ZenoEventType =
  | "job.funded"
  | "review.decided"
  | "payout.settled"
  | "integrity.flagged";

export interface ZenoEvent {
  event: ZenoEventType;
  occurred_at: string;
  chain_id: number;
  data: Record<string, string | number | boolean | null>;
}

export interface ViaSocketConfig {
  url: string;
  /** Optional: signs the body as `x-zeno-signature: sha256=<hex hmac>`. */
  secret?: string;
}

export function viaSocketConfig(env: {
  VIASOCKET_WEBHOOK_URL?: string;
  VIASOCKET_WEBHOOK_SECRET?: string;
}): ViaSocketConfig | null {
  const url = (env.VIASOCKET_WEBHOOK_URL ?? "").trim();
  if (!url) return null;
  const secret = (env.VIASOCKET_WEBHOOK_SECRET ?? "").trim();
  return secret ? { url, secret } : { url };
}

export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Deliver one event. Resolves to false (never throws) on any failure. */
export async function sendEvent(
  config: ViaSocketConfig,
  event: ZenoEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.secret) headers["x-zeno-signature"] = signBody(body, config.secret);
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`[viasocket] ${event.event} delivery failed: ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[viasocket] ${event.event} delivery failed: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

/**
 * Emit an event if viaSocket is configured. Runs after the HTTP response
 * (Next.js `after`); outside a request scope (scripts, tests) it runs in the
 * background instead.
 */
export function emitZenoEvent(type: ZenoEventType, data: ZenoEvent["data"]): void {
  let config: ViaSocketConfig | null;
  let chainId: number;
  let apps: boolean;
  try {
    const env = getEnv();
    config = viaSocketConfig(env);
    chainId = env.CHAIN_ID;
    apps = viasocketConfigured(env);
  } catch {
    return;
  }
  if (!config && !apps) return;
  const event: ZenoEvent = { event: type, occurred_at: new Date().toISOString(), chain_id: chainId, data };
  const work = async () => {
    // The webhook flow (optional) and each user's own Slack/Discord alerts.
    if (config) await sendEvent(config, event);
    if (apps) await deliverAppAlerts(type, data);
  };
  try {
    after(work);
  } catch {
    void work();
  }
}
