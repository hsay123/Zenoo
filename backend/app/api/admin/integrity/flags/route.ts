/**
 * GET /api/admin/integrity/flags – list integrity flags (admin only).
 *
 * Query: ?status=open|confirmed|cleared (default open). Each flag carries the
 * flagged account's and the related account's email/wallet for review.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { tigerGraphConfig } from "@/lib/integrity/tigergraph";
import { getEnv } from "@/lib/env";

const statusSchema = z.enum(["open", "confirmed", "cleared"]).default("open");

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      const status = statusSchema.parse(req.nextUrl.searchParams.get("status") ?? undefined);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("account_flags")
        .select(
          "id, signal, evidence, status, source, created_at, updated_at, " +
            "user:users!account_flags_user_id_fkey(id, email, wallet_address, role), " +
            "related:users!account_flags_related_user_id_fkey(id, email, wallet_address, role)",
        )
        .eq("status", status)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") {
          throw HttpError.conflict("Integrity flags need migration 013_account_flags");
        }
        throw HttpError.internal(`Failed to list flags: ${error.message}`);
      }
      return ok({
        engine: tigerGraphConfig(getEnv()) ? "tigergraph" : "local",
        items: data ?? [],
      });
    }),
  );
}
