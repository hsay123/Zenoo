/**
 * DELETE /api/api-keys/{id} – revoke a Data API key (buyer, own organisation).
 * The row is kept (revoked_at set) so usage history still names the key.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { KEY_COLUMNS, organizationOf } from "@/lib/dataapi/keys";

export async function OPTIONS() {
  return corsOptions();
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const { id } = await params;
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw HttpError.notFound("API key not found");

      const { data, error } = await getSupabase()
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organizationOf(user))
        .is("revoked_at", null)
        .select(KEY_COLUMNS)
        .maybeSingle();
      if (error) throw HttpError.internal(`Failed to revoke API key: ${error.message}`);
      if (!data) throw HttpError.notFound("API key not found or already revoked");
      return ok(data);
    }),
  );
}
