import { describe, expect, it } from "vitest";
import { KEY_PREFIX, generateApiKey, hashApiKey, looksLikeApiKey } from "../keys";

describe("API keys", () => {
  it("generates zeno_test_ keys with a hash and a short display prefix", () => {
    const k = generateApiKey();
    expect(k.key.startsWith(KEY_PREFIX)).toBe(true);
    expect(looksLikeApiKey(k.key)).toBe(true);
    expect(k.hash).toBe(hashApiKey(k.key));
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.prefix).toBe(k.key.slice(0, KEY_PREFIX.length + 6));
    expect(k.key.includes(k.hash)).toBe(false);
  });

  it("never repeats a key", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().key));
    expect(keys.size).toBe(200);
  });

  it("rejects values that are not keys (e.g. a Privy token)", () => {
    expect(looksLikeApiKey("eyJhbGciOiJFUzI1NiJ9.x.y")).toBe(false);
    expect(looksLikeApiKey("zeno_test_short")).toBe(false);
    expect(looksLikeApiKey(`zeno_prod_${"a".repeat(43)}`)).toBe(false);
  });
});
