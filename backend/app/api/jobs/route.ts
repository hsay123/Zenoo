/**
 * POST /api/jobs  – create a draft job (buyer only)
 * GET  /api/jobs  – list jobs (buyer: own projects; admin: all)
 */

import type { NextRequest } from "next/server";
import { created, ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { paginated, parsePagination } from "@/lib/api/pagination";
import { requireRole } from "@/lib/auth/requireRole";
import { buyerOwnsProject, toJob, type JobRow } from "@/lib/jobs/repository";
import { hashCanonicalJson } from "@/lib/hash";
import { getSupabase } from "@/lib/db/supabase";
import {
  createJobSchema,
  listJobsQuerySchema,
  searchParamsToRecord,
} from "@/lib/validation/jobs";
import type { Job } from "@/src/types/api";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const input = createJobSchema.parse(await readJson(req));

      const owns = await buyerOwnsProject(input.project_id, user.id);
      if (!owns) {
        throw HttpError.forbidden("Project not found or not owned by you");
      }

      const supabase = getSupabase();

      if (input.schema_version_id) {
        const { data: schema, error } = await supabase
          .from("schema_versions")
          .select("id")
          .eq("id", input.schema_version_id)
          .maybeSingle();
        if (error) {
          throw HttpError.internal(`Failed to load schema version: ${error.message}`);
        }
        if (!schema) {
          throw HttpError.unprocessable("Unknown schema_version_id", [
            { path: ["schema_version_id"], message: "schema version not found" },
          ]);
        }
      }

      const policyHash = input.rubric ? hashCanonicalJson(input.rubric) : null;

      const { data, error } = await supabase
        .from("jobs")
        .insert({
          project_id: input.project_id,
          schema_version_id: input.schema_version_id ?? null,
          title: input.title,
          description: input.description ?? null,
          modality: input.modality,
          reward_per_task: input.reward_per_task,
          budget: input.budget,
          deadline: input.deadline ?? null,
          rubric: input.rubric ?? null,
          policy_hash: policyHash,
          label_list: input.label_list,
          status: "draft",
        })
        .select("*")
        .single();
      if (error) throw HttpError.internal(`Failed to create job: ${error.message}`);

      return created(toJob(data as JobRow) as Job);
    }),
  );
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer", "admin");
      const filters = listJobsQuerySchema.parse(
        searchParamsToRecord(req.nextUrl.searchParams),
      );
      const page = parsePagination(req.nextUrl.searchParams);

      const supabase = getSupabase();

      let projectIds: string[] | null = null;
      if (user.role !== "admin") {
        const { data: projects, error } = await supabase
          .from("projects")
          .select("id")
          .eq("buyer_id", user.id);
        if (error) throw HttpError.internal(`Failed to load projects: ${error.message}`);
        projectIds = (projects ?? []).map((p) => p.id as string);
        if (projectIds.length === 0) {
          return ok(paginated<Job>([], 0, page));
        }
      }

      let query = supabase
        .from("jobs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page.from, page.to);

      if (projectIds) query = query.in("project_id", projectIds);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.modality) query = query.eq("modality", filters.modality);

      const { data, error, count } = await query;
      if (error) throw HttpError.internal(`Failed to list jobs: ${error.message}`);

      const items = (data ?? []).map((row) => toJob(row as JobRow));
      return ok(paginated(items, count ?? items.length, page));
    }),
  );
}
