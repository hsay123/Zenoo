/**
 * PATCH /api/admin/integrity/flags/{id} – confirm or clear a flag (admin only).
 *
 * Body: { status: "confirmed" | "cleared" | "open" }. A cleared flag stops
 * routing that account to human review; a confirmed one keeps it there. Any
 * further action (suspension, role change) is a separate, explicit admin step.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";

const bodySchema = z.object({ status: z.enum(["open", "confirmed", "cleared"]) });

export async function OPTIONS() {
  return corsOptions();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const admin = await requireRole(req, "admin");
      const { id } = await params;
      const { status } = bodySchema.parse(await readJson(req));

      const { data, error } = await getSupabase()
        .from("account_flags")
        .update({
          status,
          resolved_by: status === "open" ? null : admin.id,
          resolved_at: status === "open" ? null : new Date().toISOString(),
        })
        .eq("id", id)
        .select("id, status, resolved_at")
        .maybeSingle();
      if (error) throw HttpError.internal(`Failed to update flag: ${error.message}`);
      if (!data) throw HttpError.notFound("Flag not found");
      return ok(data);
    }),
  );
}
