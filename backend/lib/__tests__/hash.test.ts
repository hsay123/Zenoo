/**
 * Canonical JSON hashing tests.
 */

import { describe, it, expect } from "vitest";
import { canonicalize, hashCanonicalJson } from "../hash";

describe("canonicalize", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}');
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("keeps primitive values unchanged", () => {
    expect(canonicalize("x")).toBe('"x"');
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(7)).toBe("7");
  });
});

describe("hashCanonicalJson", () => {
  it("returns a 0x-prefixed 32-byte hex hash", () => {
    expect(hashCanonicalJson({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is independent of key insertion order", () => {
    expect(hashCanonicalJson({ a: 1, b: 2 })).toBe(
      hashCanonicalJson({ b: 2, a: 1 }),
    );
  });

  it("differs for different values", () => {
    expect(hashCanonicalJson({ a: 1 })).not.toBe(hashCanonicalJson({ a: 2 }));
  });

  it("is deterministic across calls", () => {
    const value = { rubric: { iou: 0.5, labels: ["cup", "block"] } };
    expect(hashCanonicalJson(value)).toBe(hashCanonicalJson(value));
  });
});
