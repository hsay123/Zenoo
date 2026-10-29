/**
 * S9 — An empty-wallet company funds a job from its own wallet (real stack).
 *
 * Regression for email sign-ups: their embedded Privy wallet starts with no
 * test USDC and no gas, and "Fund from wallet" used to fail with a raw RPC
 * error. Now the funding panel shows the wallet's balance, offers
 * "Get free test funds" (testnet faucet: only to the account's own wallet,
 * only what the job needs), and wallet funding then works through the UI.
 *
 * Runs as a brand-new company with a fresh, empty wallet each time.
 * Prereqs: frontend https://localhost:3000, backend http://localhost:3010,
 * a treasury with test USDC + gas on Base Sepolia.
 */
import { test, expect } from "playwright/test";
import { createPublishedJob, api } from "./helpers/platform";
import { freshAccount, installWallet, loginWithWallet } from "./helpers/wallet";

test("empty wallet: get test funds, then fund the job from the wallet", async ({ page }) => {
  test.setTimeout(300_000);
  const account = freshAccount();
  await installWallet(page, account);
  await loginWithWallet(page);

  // Onboard as a company, through the API with the session the browser holds.
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("privy:token") ?? "null"));
  const onboard = await api("/api/onboarding/complete", {
    token,
    method: "POST",
    body: { account_type: "buyer", organization_name: `Email Co ${Date.now()}` },
  });
  expect(onboard.status, onboard.text).toBe(200);
  const job = await createPublishedJob(token, { modality: "image", count: 1, title: `S9 wallet ${Date.now()}`, reward: 0.1, budget: 0.1, fund: false });

  await page.goto(`/workspace/buyer/jobs/${job.jobId}`);
  await expect(page.getByText(/0 USDC · 0\.0000 ETH for gas/)).toBeVisible({ timeout: 40_000 });
  const fundFromWallet = page.getByRole("button", { name: /Fund from wallet/ });
  await expect(fundFromWallet).toBeDisabled();

  await page.getByRole("button", { name: "Get free test funds" }).click();
  // The wallet now holds exactly the job's budget and some gas.
  await expect(page.getByText(/0\.1 USDC · 0\.00001\d* ETH for gas/)).toBeVisible({ timeout: 120_000 });
  await expect(fundFromWallet).toBeEnabled();

  await fundFromWallet.click();
  // Wallet funding: the job header shows the on-chain funding transaction.
  await expect(page.getByText(/Funded on Base Sepolia — 0x[0-9a-f]{64}/)).toBeVisible({ timeout: 180_000 });

  // Once funded, the faucet refuses: the wallet is empty again, and topping
  // it up would pay this job's budget a second time.
  const again = await api(`/api/jobs/${job.jobId}/faucet`, { token, method: "POST", body: { address: account.address } });
  expect(again.status, again.text).toBe(409);
});

test("the faucet refuses a wallet that is not the caller's", async ({ page }) => {
  test.setTimeout(120_000);
  const account = freshAccount();
  await installWallet(page, account);
  await loginWithWallet(page);
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("privy:token") ?? "null"));
  await api("/api/onboarding/complete", { token, method: "POST", body: { account_type: "buyer", organization_name: `Other Co ${Date.now()}` } });
  const job = await createPublishedJob(token, { modality: "image", count: 1, title: `S9 guard ${Date.now()}`, reward: 0.1, budget: 0.1, fund: false });
  const stranger = freshAccount().address;
  const res = await api(`/api/jobs/${job.jobId}/faucet`, { token, method: "POST", body: { address: stranger } });
  expect(res.status, res.text).toBe(403);
});
