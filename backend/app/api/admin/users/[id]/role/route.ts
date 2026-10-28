/**
 * PATCH /api/admin/users/{id}/role – change a user's role (admin only).
 *
 * Guards:
 *   - the target user must exist;
 *   - an admin cannot demote their own account (avoids self-lockout).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { setRoleSchema } from "@/lib/validation/admin";
import type { User } from "@/src/types/api";

const USER_COLUMNS = "id, wallet_address, email, role, status, created_at";

export async function OPTIONS() {
  return corsOptions();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const actor = await requireRole(req, "admin");
      const { id } = await params;
      const input = setRoleSchema.parse(await readJson(req));

      if (id === actor.id && input.role !== "admin") {
        throw HttpError.badRequest("You cannot change your own admin role");
      }

      const supabase = getSupabase();

      const { data: existing, error: findError } = await supabase
        .from("users")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (findError) throw HttpError.internal(`Failed to load user: ${findError.message}`);
      if (!existing) throw HttpError.notFound("User not found");

      const { data, error } = await supabase
        .from("users")
        .update({ role: input.role })
        .eq("id", id)
        .select(USER_COLUMNS)
        .single();
      if (error) throw HttpError.internal(`Failed to update role: ${error.message}`);

      return ok(data as unknown as User);
    }),
  );
}
