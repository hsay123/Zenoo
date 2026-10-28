/**
 * Canonical JSON hashing (keccak256) used for `policy_hash`, `payload_hash`,
 * and annotation receipts.
 *
 * Canonicalisation sorts object keys recursively so that semantically equal
 * values produce identical hashes regardless of key insertion order.
 */

import { keccak256, stringToHex } from "viem";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortValue(source[key]);
    }
    return sorted;
  }
  return value;
}

/** Deterministic JSON string with recursively sorted keys. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** keccak256 of the canonical JSON encoding, as a 0x-prefixed hex string. */
export function hashCanonicalJson(value: unknown): string {
  return keccak256(stringToHex(canonicalize(value)));
}
