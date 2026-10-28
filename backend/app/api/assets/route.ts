/**
 * POST /api/assets – register an uploaded asset (buyer only).
 *
 * The client first calls POST /api/assets/upload-url, uploads the file to the
 * returned signed URL, then registers the object here with its content hash and
 * media dimensions/duration.
 */

import type { NextRequest } from "next/server";
import { created, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import {
  ASSET_COLUMNS,
  assertObjectKeyInProject,
  assertProjectAccess,
  toAsset,
} from "@/lib/content/repository";
import { createAssetSchema } from "@/lib/validation/content";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const input = createAssetSchema.parse(await readJson(req));
      await assertProjectAccess(input.project_id, user);
      assertObjectKeyInProject(input.project_id, input.object_key);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("assets")
        .insert({
          project_id: input.project_id,
          object_key: input.object_key,
          content_hash: input.content_hash,
          modality: input.modality,
          duration_ms: input.duration_ms ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          consent_ref: input.consent_ref ?? null,
        })
        .select(ASSET_COLUMNS)
        .single();
      if (error) throw HttpError.internal(`Failed to register asset: ${error.message}`);

      return created(toAsset(data as Record<string, unknown>));
    }),
  );
}
