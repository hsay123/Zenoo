/**
 * Test-fixture visibility.
 *
 * The e2e suite runs against the same Supabase project as the live demo, so its
 * jobs (`is_test = true`) must never appear in a real contributor's queue.
 * Development keeps them visible so the suite can claim and settle its own
 * fixtures; production hides them unless `HIDE_TEST_JOBS` overrides.
 */

import type { Env } from "@/lib/env";

export function shouldHideTestJobs(env: Env): boolean {
  if (env.HIDE_TEST_JOBS) return env.HIDE_TEST_JOBS === "true";
  return env.NODE_ENV === "production";
}
