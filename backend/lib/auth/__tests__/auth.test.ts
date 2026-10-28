/**
 * Auth helper unit tests (DEV-mode parsing, bearer parsing, error mapping).
 */

import { describe, it, expect } from "vitest";
import { AuthError } from "../errors";
import { parseDevUserId, parseBearerToken } from "../verifyToken";

const UUID = "5eed0000-0000-4000-8000-000000000001";

describe("parseDevUserId", () => {
  it("returns a valid UUID", () => {
    expect(parseDevUserId(UUID)).toBe(UUID);
  });

  it("trims surrounding whitespace", () => {
    expect(parseDevUserId(`  ${UUID}  `)).toBe(UUID);
  });

  it("accepts uppercase hex", () => {
    const upper = UUID.toUpperCase();
    expect(parseDevUserId(upper)).toBe(upper);
  });

  it.each([null, undefined, "", "   "])(
    "throws UNAUTHORIZED when the header is %p",
    (raw) => {
      try {
        parseDevUserId(raw as string | null);
        throw new Error("expected parseDevUserId to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe("UNAUTHORIZED");
        expect((err as AuthError).status).toBe(401);
      }
    },
  );

  it("rejects a non-UUID value", () => {
    expect(() => parseDevUserId("seed-buyer-0000")).toThrow(AuthError);
  });
});

describe("parseBearerToken", () => {
  it("extracts the token", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the scheme", () => {
    expect(parseBearerToken("bearer token123")).toBe("token123");
  });

  it("throws UNAUTHORIZED when the header is missing", () => {
    expect(() => parseBearerToken(null)).toThrow(AuthError);
  });

  it("throws UNAUTHORIZED on a malformed header", () => {
    expect(() => parseBearerToken("Token abc")).toThrow(AuthError);
  });
});

describe("AuthError", () => {
  it("maps codes to HTTP status", () => {
    expect(new AuthError("UNAUTHORIZED", "x").status).toBe(401);
    expect(new AuthError("FORBIDDEN", "x").status).toBe(403);
  });
});
