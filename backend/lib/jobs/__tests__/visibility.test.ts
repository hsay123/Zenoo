/**
 * Test-fixture visibility rule (pure, no DB).
 *
 * The e2e suite writes `is_test` jobs into the same database the live demo
 * uses, so the default must be "hidden in production, visible in dev".
 */

import { describe, it, expect } from "vitest";
import type { Env } from "@/lib/env";
import { shouldHideTestJobs } from "../visibility";

const env = (overrides: Partial<Env>): Env => overrides as Env;

describe("shouldHideTestJobs", () => {
  it("hides fixtures in production by default", () => {
    expect(shouldHideTestJobs(env({ NODE_ENV: "production" }))).toBe(true);
  });

  it("keeps fixtures visible in development so the e2e suite can use them", () => {
    expect(shouldHideTestJobs(env({ NODE_ENV: "development" }))).toBe(false);
    expect(shouldHideTestJobs(env({ NODE_ENV: "test" }))).toBe(false);
  });

  it("lets the explicit override win in both directions", () => {
    expect(
      shouldHideTestJobs(env({ NODE_ENV: "development", HIDE_TEST_JOBS: "true" })),
    ).toBe(true);
    expect(
      shouldHideTestJobs(env({ NODE_ENV: "production", HIDE_TEST_JOBS: "false" })),
    ).toBe(false);
  });
});
