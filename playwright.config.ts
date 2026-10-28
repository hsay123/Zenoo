/**
 * E2E configuration for the real stack (no mocks).
 *
 * Frontend: https://localhost:3000 (Next dev over HTTPS — the SIWE origin fix
 * means the dev certificate is self-signed, hence ignoreHTTPSErrors).
 * Sessions: playwright/.auth/<role>.json captured with
 * scripts/capture-sessions.mjs (gitignored) and injected via storageState.
 */
import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Slices mutate roles and data, so a single worker keeps ordering honest.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "https://localhost:3000",
    ignoreHTTPSErrors: true,
  },
});