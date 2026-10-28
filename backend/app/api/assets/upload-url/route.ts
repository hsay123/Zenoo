/**
 * POST /api/assets/upload-url – mint a short-lived signed upload URL (buyer only).
 *
 * The object key is prefixed with the project id so an asset can never be
 * registered against another project's prefix (enforced again in POST /api/assets).
 */

import type { NextRequest } from "next/server";
import { created, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";
import { assertProjectAccess, objectKeyPrefix } from "@/lib/content/repository";
import { uploadUrlSchema } from "@/lib/validation/content";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const input = uploadUrlSchema.parse(await readJson(req));
      await assertProjectAccess(input.project_id, user);

      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const objectKey = `${objectKeyPrefix(input.project_id)}${crypto.randomUUID()}-${safeName}`;

      const env = getEnv();
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .createSignedUploadUrl(objectKey);
      if (error || !data) {
        throw HttpError.internal(
          `Failed to create upload URL: ${error?.message ?? "unknown error"}`,
        );
      }

      return created({
        upload_url: data.signedUrl,
        object_key: objectKey,
        token: data.token,
        method: "PUT" as const,
      });
    }),
  );
}
