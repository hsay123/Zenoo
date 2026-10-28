/**
 * Admin validation schema tests (pure).
 */

import { describe, it, expect } from "vitest";
import { listUsersQuerySchema, setRoleSchema } from "../admin";

describe("setRoleSchema", () => {
  it("accepts each valid role", () => {
    for (const role of ["buyer", "contributor", "reviewer", "admin"]) {
      expect(setRoleSchema.parse({ role }).role).toBe(role);
    }
  });

  it("rejects an unknown role", () => {
    expect(() => setRoleSchema.parse({ role: "superadmin" })).toThrow();
  });

  it("rejects a missing role", () => {
    expect(() => setRoleSchema.parse({})).toThrow();
  });
});

describe("listUsersQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(listUsersQuerySchema.parse({})).toEqual({});
  });

  it("accepts role + search", () => {
    const parsed = listUsersQuerySchema.parse({ role: "buyer", search: "a@b.com" });
    expect(parsed.role).toBe("buyer");
    expect(parsed.search).toBe("a@b.com");
  });

  it("rejects an unknown role", () => {
    expect(() => listUsersQuerySchema.parse({ role: "root" })).toThrow();
  });
});
