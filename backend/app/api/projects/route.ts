/**
 * POST /api/projects – create a project (buyer only)
 * GET  /api/projects – list projects (buyer: own; admin: all)
 */

import type { NextRequest } from "next/server";
import { created, ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { paginated, parsePagination } from "@/lib/api/pagination";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { PROJECT_COLUMNS, toProject } from "@/lib/content/repository";
import { createProjectSchema } from "@/lib/validation/content";
import type { Project } from "@/src/types/api";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const input = createProjectSchema.parse(await readJson(req));

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("projects")
        .insert({
          buyer_id: user.id,
          name: input.name,
          data_rights: input.data_rights ?? null,
          retention_policy: input.retention_policy ?? null,
        })
        .select(PROJECT_COLUMNS)
        .single();
      if (error) throw HttpError.internal(`Failed to create project: ${error.message}`);

      return created(toProject(data as Record<string, unknown>));
    }),
  );
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer", "admin");
      const page = parsePagination(req.nextUrl.searchParams);

      const supabase = getSupabase();
      let query = supabase
        .from("projects")
        .select(PROJECT_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page.from, page.to);
      if (user.role !== "admin") query = query.eq("buyer_id", user.id);

      const { data, error, count } = await query;
      if (error) throw HttpError.internal(`Failed to list projects: ${error.message}`);

      const items = (data ?? []).map((row) => toProject(row as Record<string, unknown>));
      return ok(paginated<Project>(items, count ?? items.length, page));
    }),
  );
}
