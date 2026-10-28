/**
 * GET /api/admin/users – list users (admin only).
 * Filters: ?role=, ?search= (email contains), ?page=, ?per_page=
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { paginated, parsePagination } from "@/lib/api/pagination";
import { listUsersQuerySchema } from "@/lib/validation/admin";
import type { User } from "@/src/types/api";

const USER_COLUMNS = "id, wallet_address, email, role, status, created_at";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      const sp = req.nextUrl.searchParams;
      const filters = listUsersQuerySchema.parse({
        role: sp.get("role") ?? undefined,
        search: sp.get("search") ?? undefined,
      });
      const page = parsePagination(sp);

      const supabase = getSupabase();
      let query = supabase
        .from("users")
        .select(USER_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page.from, page.to);

      if (filters.role) query = query.eq("role", filters.role);
      if (filters.search) query = query.ilike("email", `%${filters.search}%`);

      const { data, error, count } = await query;
      if (error) throw HttpError.internal(`Failed to list users: ${error.message}`);

      const items = (data ?? []) as unknown as User[];
      return ok(paginated(items, count ?? items.length, page));
    }),
  );
}
