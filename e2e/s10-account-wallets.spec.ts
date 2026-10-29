/**
 * S10 — Account page: wallets, balances, payout wallet (real stack).
 *
 * A fresh contributor sees its wallet with a live Base Sepolia balance and the
 * "Payout wallet" mark; the payout wallet can only be set to one of the
 * account's own Privy wallets; profile sync answers with the linked wallets.
 */
import { test, expect } from "playwright/test";
import { api } from "./helpers/platform";
import { freshAccount, installWallet, loginWithWallet } from "./helpers/wallet";

test("account shows the wallet, and payouts only go to the account's own wallets", async ({ page }) => {
  test.setTimeout(180_000);
  const account = freshAccount();
  await installWallet(page, account);
  await loginWithWallet(page);
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("privy:token") ?? "null"));
  const onboard = await api("/api/onboarding/complete", {
    token,
    method: "POST",
    body: { account_type: "contributor", wallet_address: account.address },
  });
  expect(onboard.status, onboard.text).toBe(200);

  await page.goto("/workspace/contributor/account");
  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible({ timeout: 40_000 });
  const wallets = page.getByRole("heading", { name: "Wallets" }).locator("xpath=ancestor::section[1]");
  await expect(wallets.getByText(account.address)).toBeVisible();
  await expect(wallets.getByText("Payout wallet", { exact: true })).toBeVisible();
  await expect(wallets.getByText(/0 USDC · 0\.000000 ETH/)).toBeVisible({ timeout: 20_000 });
  await wallets.screenshot({ path: "test-results/s10-wallets.png" });

  const stranger = await api("/api/me/payout-wallet", { token, method: "PUT", body: { address: freshAccount().address } });
  expect(stranger.status, stranger.text).toBe(403);
  const own = await api("/api/me/payout-wallet", { token, method: "PUT", body: { address: account.address } });
  expect(own.status, own.text).toBe(200);

  const sync = await api("/api/me/sync", { token, method: "POST" });
  expect(sync.status, sync.text).toBe(200);
  expect((sync.json.data as { linked_wallets: string[] }).linked_wallets).toContain(account.address.toLowerCase());
});
