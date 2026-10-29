/**
 * Data API keys (docs/system/DATA-API.md §3).
 *
 * A key is `zeno_test_` + 32 random bytes in base62 (Base Sepolia only; the
 * `zeno_live_` prefix is reserved). Only its SHA-256 hash and a short display
 * prefix are stored, so a leaked database never leaks a usable key, and the
 * full key is shown to its creator exactly once.
 */

import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/verifyToken";

export const KEY_PREFIX = "zeno_test_";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Characters kept for display, e.g. `zeno_test_4fQ2…`. */
const DISPLAY_LENGTH = KEY_PREFIX.length + 6;

function base62(bytes: Buffer): string {
  let n = BigInt(`0x${bytes.toString("hex")}`);
  let out = "";
  const radix = BigInt(62);
  while (n > BigInt(0)) {
    out = BASE62[Number(n % radix)] + out;
    n /= radix;
  }
  return out.padStart(43, "0"); // 32 bytes fit in 43 base62 digits
}

export interface NewApiKey {
  /** The full key: return it to the creator once, never store it. */
  key: string;
  hash: string;
  prefix: string;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): NewApiKey {
  const key = `${KEY_PREFIX}${base62(randomBytes(32))}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, DISPLAY_LENGTH) };
}

/** True when the value has the shape of a Zeno API key (cheap pre-check). */
export function looksLikeApiKey(value: string): boolean {
  return /^zeno_(test|live)_[0-9A-Za-z]{43}$/.test(value);
}

/** Columns returned for a key (never the hash). */
export const KEY_COLUMNS = "id, name, prefix, scopes, last_used_at, revoked_at, created_at";

/** Keys belong to the buyer's organisation. */
export function organizationOf(user: AuthUser): string {
  if (!user.organization_id) {
    throw HttpError.forbidden("Finish company onboarding first: API keys belong to an organization");
  }
  return user.organization_id;
}
