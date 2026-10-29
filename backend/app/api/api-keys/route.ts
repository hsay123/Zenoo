/**
 * GET  /api/api-keys – the organisation's Data API keys (never the key itself)
 * POST /api/api-keys – create a key; the full key is in this response only
 *
 * Buyer only (Privy session). Keys belong to the buyer's organisation. See
 * docs/system/DATA-API.md §3.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { created, ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { generateApiKey, KEY_COLUMNS, organizationOf } from "@/lib/dataapi/keys";

/** Active keys an organisation may hold at once. */
const MAX_ACTIVE_KEYS = 10;

const createKeySchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const { data, error } = await getSupabase()
        .from("api_keys")
        .select(KEY_COLUMNS)
        .eq("organization_id", organizationOf(user))
        .order("created_at", { ascending: false });
      if (error) throw HttpError.internal(`Failed to list API keys: ${error.message}`);
      return ok(data ?? []);
    }),
  );
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const organizationId = organizationOf(user);
      const { name } = createKeySchema.parse(await readJson(req));

      const supabase = getSupabase();
      const { count, error: countError } = await supabase
        .from("api_keys")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("revoked_at", null);
      if (countError) throw HttpError.internal(`Failed to count API keys: ${countError.message}`);
      if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
        throw HttpError.conflict(`An organization can hold ${MAX_ACTIVE_KEYS} active keys; revoke one first`);
      }

      const fresh = generateApiKey();
      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          organization_id: organizationId,
          created_by: user.id,
          name,
          prefix: fresh.prefix,
          key_hash: fresh.hash,
        })
        .select(KEY_COLUMNS)
        .single();
      if (error) throw HttpError.internal(`Failed to create API key: ${error.message}`);

      // The only time the full key leaves the server.
      return created({ ...data, key: fresh.key });
    }),
  );
}
