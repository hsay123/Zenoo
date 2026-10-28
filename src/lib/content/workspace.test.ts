import { describe, expect, it } from "vitest";
import {
  roleFromPath,
  workspaceOrder,
  workspaceRoles,
} from "./workspace";

/**
 * Regression for the admin workspace section.
 *
 * The product shell derives the active role from the path, so `/workspace/admin`
 * must resolve to the `admin` role and every role in the tab order must have a
 * config (otherwise the shell would crash on `workspaceRoles[role]`).
 */
describe("workspace navigation", () => {
  it("maps /workspace/admin (and its children) to the admin role", () => {
    expect(roleFromPath("/workspace/admin")).toBe("admin");
    expect(roleFromPath("/workspace/admin/users")).toBe("admin");
  });

  it("still maps the other sections", () => {
    expect(roleFromPath("/workspace/buyer/jobs/1")).toBe("buyer");
    expect(roleFromPath("/workspace/contributor/earnings")).toBe("contributor");
    expect(roleFromPath("/workspace/reviewer/review/1")).toBe("reviewer");
    expect(roleFromPath("/workspace")).toBe("buyer");
  });

  it("has a home and config for every role in the tab order", () => {
    for (const key of workspaceOrder) {
      expect(workspaceRoles[key]).toBeDefined();
      expect(workspaceRoles[key].home).toBe(`/workspace/${key}`);
      expect(workspaceRoles[key].nav.length).toBeGreaterThan(0);
    }
    expect(workspaceOrder).toContain("admin");
  });
});
