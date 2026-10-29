/**
 * S1b — First-time onboarding submit (fresh account, real stack).
 *
 * Mints a brand-new wallet identity (so the backend creates a brand-new user),
 * signs in through Privy's real SIWE flow, and proves the two onboarding bugs
 * stay fixed end to end:
 *   1. a first-time account opening a direct workspace URL is held on
 *      `/onboarding` (s1 re-checks this with a captured account);
 *   2. selecting Contributor issues exactly one real POST to
 *      `/api/onboarding/complete` with `{ account_type: "contributor" }`, and
 *      only after the confirmed response does the account land in the
 *      contributor workspace — where it stays across a reload and is never
 *      shown the chooser again. (Regression: the card used to move to the
 *      "submitting" screen without ever calling the API.)
 *
 * Self-contained: no captured storage state, no mocks. The only non-production
 * piece is the wallet, whose signatures are real secp256k1 signatures from a
 * throwaway local key. Each run creates a new backend test user.
 *
 * Prereqs: frontend on https://localhost:3000, backend on http://localhost:3010.
 * Run: npx playwright test e2e/s1b-onboarding-submit.spec.ts
 */
import { test, expect } from "playwright/test";
import { freshAccount, installWallet, loginWithWallet } from "./helpers/wallet";

test.describe("first-time onboarding (fresh account)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("contributor selection POSTs once, persists, and is not asked again", async ({
    page,
  }) => {
    const account = freshAccount();
    await installWallet(page, account);

    const onboardingPosts: Array<{ body: unknown; status: number }> = [];
    page.on("response", (res) => {
      const path = new URL(res.url()).pathname;
      if (res.request().method() === "POST" && path.endsWith("/api/onboarding/complete")) {
        let body: unknown = null;
        try {
          body = res.request().postDataJSON();
        } catch {
          /* non-JSON body — leave null and let the assertion fail loudly */
        }
        onboardingPosts.push({ body, status: res.status() });
      }
    });

    await loginWithWallet(page);

    // A first-time account must be held on the chooser, never a workspace.
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /here for my company/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /here to contribute/i }),
    ).toBeVisible();

    // Selecting Contributor must actually submit — not just show a spinner.
    await page.getByRole("button", { name: /here to contribute/i }).click();

    await expect.poll(() => onboardingPosts.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/workspace\/contributor$/, { timeout: 30_000 });
    await expect(page.getByText(/· contributor$/)).toBeVisible({ timeout: 20_000 });

    // Exactly one request, carrying exactly the contributor choice, confirmed.
    await page.waitForTimeout(1500);
    expect(onboardingPosts).toHaveLength(1);
    // The signed-in wallet is sent as the payout address.
    expect(onboardingPosts[0].body).toEqual({
      account_type: "contributor",
      wallet_address: account.address,
    });
    expect(onboardingPosts[0].status).toBe(200);

    // The choice persisted: a reload keeps the account out of onboarding.
    await page.reload();
    await expect(page).toHaveURL(/\/workspace\/contributor$/, { timeout: 30_000 });

    // A completed account is never shown the chooser again.
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/workspace\/contributor$/, { timeout: 30_000 });
  });

  test("buyer selection requires an org name and creates the organization", async ({
    page,
  }) => {
    const account = freshAccount();
    await installWallet(page, account);

    const onboardingPosts: Array<{ body: unknown; status: number }> = [];
    page.on("response", (res) => {
      const path = new URL(res.url()).pathname;
      if (res.request().method() === "POST" && path.endsWith("/api/onboarding/complete")) {
        let body: unknown = null;
        try {
          body = res.request().postDataJSON();
        } catch {
          /* see the contributor test */
        }
        onboardingPosts.push({ body, status: res.status() });
      }
    });

    await loginWithWallet(page);
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });

    await page.getByRole("button", { name: /here for my company/i }).click();

    const orgName = page.locator("#org-name");
    await expect(orgName).toBeVisible();

    // The organization name is required: an empty form cannot be submitted and
    // issues no request at all.
    const continueButton = page.getByRole("button", {
      name: /continue to buyer workspace/i,
    });
    await expect(continueButton).toBeDisabled();
    expect(onboardingPosts).toHaveLength(0);

    const org = `Acme E2E ${Date.now()}`;
    await orgName.fill(org);
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect.poll(() => onboardingPosts.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/workspace\/buyer$/, { timeout: 30_000 });

    await page.waitForTimeout(1500);
    expect(onboardingPosts).toHaveLength(1);
    expect(onboardingPosts[0].body).toEqual({
      account_type: "buyer",
      organization_name: org,
      wallet_address: account.address,
    });
    expect(onboardingPosts[0].status).toBe(200);

    // Persisted: the buyer workspace survives a reload without re-onboarding.
    await page.reload();
    await expect(page).toHaveURL(/\/workspace\/buyer$/, { timeout: 30_000 });
  });
});
