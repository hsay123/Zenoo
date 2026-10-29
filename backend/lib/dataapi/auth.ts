/**
 * Data API authentication (docs/system/DATA-API.md §3).
 *
 * `/api/v1/*` accepts only Zeno API keys — never a Privy token — and the app's
 * own routes never accept a key (`resolveUser` is untouched). A key resolves
 * to its organisation; that organisation needs the active API plan.
 */

import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import { consume } from "@/lib/rateLimit";
import { hashApiKey, looksLikeApiKey } from "@/lib/dataapi/keys";

/** Per key: 600 requests a minute (the API plan's limit). */
export const API_RATE_LIMIT = { points: 600, duration: 60 };

export interface ApiActor {
  keyId: string;
  organizationId: string;
  scopes: string[];
}

export async function requireApiKey(req: NextRequest): Promise<ApiActor> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || !looksLikeApiKey(match[1])) {
    throw HttpError.unauthorized("Send your API key as 'Authorization: Bearer zeno_test_…'");
  }

  const supabase = getSupabase();
  const { data: key, error } = await supabase
    .from("api_keys")
    .select("id, organization_id, scopes, revoked_at")
    .eq("key_hash", hashApiKey(match[1]))
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to check API key: ${error.message}`);
  if (!key || key.revoked_at) throw HttpError.unauthorized("Invalid or revoked API key");

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("api_plan")
    .eq("id", key.organization_id)
    .maybeSingle();
  if (orgError) throw HttpError.internal(`Failed to load organization: ${orgError.message}`);
  if (org?.api_plan !== "api") {
    throw HttpError.planRequired(
      "The Data API needs the API plan ($299/month). Subscribe from Buyer → API in the Zeno app.",
    );
  }

  await consume("data-api", key.id as string, API_RATE_LIMIT);

  // Bookkeeping must never fail the request.
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(() => undefined, () => undefined);

  return {
    keyId: key.id as string,
    organizationId: key.organization_id as string,
    scopes: (key.scopes as string[]) ?? [],
  };
}

export function requireScope(actor: ApiActor, scope: string): void {
  if (!actor.scopes.includes(scope)) throw HttpError.forbidden(`This key lacks the ${scope} scope`);
}

/** Count one request (and the records it returned) for the organisation. */
export async function recordUsage(actor: ApiActor, records: number): Promise<void> {
  const { error } = await getSupabase().rpc("record_api_usage", {
    p_org: actor.organizationId,
    p_records: records,
  });
  if (error) console.warn(`[data-api] usage not recorded: ${error.message}`);
}
