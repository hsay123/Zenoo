/**
 * S1 — Auth, role gating and the required onboarding gate (real stack).
 *
 * What this proves (nothing mocked, nothing stubbed):
 *  1. An unauthenticated visitor to any product URL is sent to /login.
 *  2. A completed account resolves the real profile from /api/me and lands on
 *     its own workspace; a contributor cannot open the buyer workspace by URL.
 *  3. The onboarding gate is authoritative: an authenticated account that has
 *     not finished onboarding is redirected to /onboarding from a direct
 *     workspace URL (including /workspace/contributor), before any workspace
 *     content renders, and the chooser offers both account types.
 *  4. A completed account opening /onboarding directly is bounced into its own
 *     workspace instead of seeing the chooser again.
 *  5. Sign out ends the session and returns to /login.
 *
 * Prereqs: playwright/.auth/contributor.json (completed account) and
 *          playwright/.auth/contributor2.json (incomplete account), captured
 *          with scripts/capture-sessions.mjs.
 * Run: npx playwright test e2e/s1-auth-roles.spec.ts
 */
import { test, expect } from "playwright/test";

const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const CONTRIBUTOR_INCOMPLETE = "./playwright/.auth/contributor2.json";
// Onboarded contributor captured only for the sign-out test (it is revoked).
const SIGNOUT = "./playwright/.auth/signout.json";

test.describe("unauthenticated gate", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sends /workspace visitors to /login", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
  });

  test("sends a direct workspace URL to /login too", async ({ page }) => {
    await page.goto("/workspace/contributor");
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  });
});

test.describe("contributor session (real Privy session)", () => {
  test.use({ storageState: CONTRIBUTOR });

  test("resolves the real profile and lands on the contributor workspace", async ({
    page,
  }) => {
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/workspace\/contributor$/, { timeout: 20_000 });

    // Live session strip proves /api/me answered with the real session.
    await expect(
      page.getByText("Signed in with a platform-verified session"),
    ).toBeVisible();
    // The account line renders the real profile from /api/me: email/address + role.
    await expect(page.getByText(/· contributor$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("session persists across a reload", async ({ page }) => {
    await page.goto("/workspace/contributor");
    await expect(page.getByText(/· contributor$/)).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/workspace\/contributor$/, { timeout: 20_000 });
    await expect(page.getByText(/· contributor$/)).toBeVisible();
  });

  test("role gate: contributor cannot open the buyer workspace", async ({ page }) => {
    await page.goto("/workspace/buyer");
    // ProductShell sends a non-admin back to their own workspace.
    await expect(page).toHaveURL(/\/workspace\/contributor$/, { timeout: 20_000 });
  });

  test("a completed account is never shown the onboarding chooser", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/workspace\/contributor$/, { timeout: 20_000 });
    await expect(page.getByText(/· contributor$/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /here to contribute/i }),
    ).toHaveCount(0);
  });

});

// Signing out revokes the Privy session on the server, so this uses its own
// disposable account: signing out the shared contributor session would log
// out every later spec that reuses it.
test.describe("sign out (disposable session)", () => {
  test.use({ storageState: SIGNOUT });

  test("sign out ends the session and returns to /login", async ({ page }) => {
    await page.goto("/workspace/contributor");
    await expect(page.getByText(/· contributor$/)).toBeVisible();
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  });
});

test.describe("onboarding gate (incomplete account)", () => {
  test.use({ storageState: CONTRIBUTOR_INCOMPLETE });

  test("a direct contributor URL redirects to /onboarding with both choices", async ({
    page,
  }) => {
    await page.goto("/workspace/contributor");
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });

    // The chooser is reachable and offers both account types.
    await expect(
      page.getByRole("button", { name: /here for my company/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /here to contribute/i }),
    ).toBeVisible();
    // No workspace content ever rendered for the incomplete account.
    await expect(
      page.getByText("Signed in with a platform-verified session"),
    ).toHaveCount(0);
  });

  test("an incomplete account cannot open the buyer workspace content", async ({
    page,
  }) => {
    await page.goto("/workspace/buyer");
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
    await expect(
      page.getByText("Signed in with a platform-verified session"),
    ).toHaveCount(0);
  });
});
