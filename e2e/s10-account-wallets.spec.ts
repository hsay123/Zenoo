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

test("a contributor withdraws earned USDC from an empty-gas wallet", async ({ page }) => {
  test.setTimeout(300_000);
  const { createPublicClient, createWalletClient, http, erc20Abi } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { baseSepolia } = await import("viem/chains");
  const fs = await import("node:fs");
  const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

  const account = freshAccount();
  await installWallet(page, account);
  await loginWithWallet(page);
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("privy:token") ?? "null"));
  await api("/api/onboarding/complete", { token, method: "POST", body: { account_type: "contributor", wallet_address: account.address } });

  // Earnings land as USDC only (a payout sends no ETH): 0.05 test USDC.
  const transport = http(process.env.E2E_RPC_URL);
  const reader = createPublicClient({ chain: baseSepolia, transport });
  const payer = privateKeyToAccount(fs.readFileSync("playwright/.auth/wallet-buyer.key", "utf8").trim() as `0x${string}`);
  const hash = await createWalletClient({ account: payer, chain: baseSepolia, transport }).writeContract({
    address: USDC, abi: erc20Abi, functionName: "transfer", args: [account.address, BigInt(50_000)],
  });
  await reader.waitForTransactionReceipt({ hash });

  await page.goto("/workspace/contributor/account");
  const wallets = page.getByRole("heading", { name: "Wallets" }).locator("xpath=ancestor::section[1]");
  await expect(wallets.getByText(/0\.05 USDC · 0\.000000 ETH/)).toBeVisible({ timeout: 40_000 });

  const recipient = freshAccount().address;
  await wallets.getByRole("button", { name: "Send", exact: true }).click();
  await wallets.getByPlaceholder("0x…").fill(recipient);
  await wallets.getByPlaceholder("1.00").fill("0.03");
  await wallets.getByRole("button", { name: "Send USDC" }).click();
  await expect(wallets.getByText(/^Sent:/)).toBeVisible({ timeout: 200_000 });

  const received = await reader.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [recipient] });
  expect(received).toBe(BigInt(30_000));
  await expect(wallets.getByText(/0\.02 USDC/)).toBeVisible({ timeout: 40_000 });
});
