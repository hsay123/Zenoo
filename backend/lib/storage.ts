/**
 * Supabase Storage helpers.
 *
 * Media lives in a private bucket; contributors receive short-lived signed
 * URLs (5 minutes) rather than public links.
 */

import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";

export const SIGNED_MEDIA_URL_TTL_SECONDS = 300;

/** Generate a short-lived signed URL for a private media object. */
export async function createSignedMediaUrl(
  objectKey: string,
  expiresIn: number = SIGNED_MEDIA_URL_TTL_SECONDS,
): Promise<string> {
  const env = getEnv();
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(objectKey, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed media URL: ${error?.message ?? "unknown error"}`,
    );
  }
  return data.signedUrl;
}
