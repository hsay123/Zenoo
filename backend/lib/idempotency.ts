/**
 * Idempotency for mutating endpoints (claim/submit/settlement).
 *
 * The `idempotency_keys` table stores a JSONB `response` keyed by a composite
 * string. A retried request with the same `Idempotency-Key` returns the stored
 * response without re-running `action`.
 *
 * Scope: the key is `${endpoint}:${userId}:${rawKey}` so the same header value
 * from different users or endpoints cannot collide.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";

export interface IdempotencyOptions<T> {
  endpoint: string;
  userId: string;
  rawKey: string | null | undefined;
  action: () => Promise<T>;
}

export function compositeKey(
  endpoint: string,
  userId: string,
  rawKey: string,
): string {
  return `${endpoint}:${userId}:${rawKey}`;
}

/** Read a previously stored response for this key, if any. */
async function loadStoredResponse<T>(key: string): Promise<T | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("idempotency_keys")
    .select("response")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Failed to read idempotency key: ${error.message}`);
  if (!data || data.response == null) return null;
  return data.response as T;
}

/**
 * Run `action` at most once per (endpoint, userId, key).
 *
 * If `rawKey` is absent, the action runs normally with no idempotency guard.
 */
export async function withIdempotency<T>(
  opts: IdempotencyOptions<T>,
): Promise<T> {
  const rawKey = opts.rawKey?.trim();
  if (!rawKey) return opts.action();

  const key = compositeKey(opts.endpoint, opts.userId, rawKey);

  const existing = await loadStoredResponse<T>(key);
  if (existing !== null) return existing;

  const result = await opts.action();

  const supabase = getSupabase();
  const { error } = await supabase.from("idempotency_keys").insert({
    key,
    endpoint: opts.endpoint,
    user_id: opts.userId,
    response: result as unknown,
  });
  // A concurrent duplicate may have inserted first (unique violation 23505);
  // that is fine – the other request stored an equivalent response.
  if (error && error.code !== "23505") {
    throw HttpError.internal(`Failed to store idempotency key: ${error.message}`);
  }

  return result;
}
