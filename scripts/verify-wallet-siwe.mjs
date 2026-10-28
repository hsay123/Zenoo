#!/usr/bin/env node
/**
 * Regression check for external-wallet (SIWE) login failing on the dev origin.
 *
 * Injects a mock EIP-1193 / EIP-6963 provider ("Brave Wallet"), opens Privy's
 * login modal, selects the wallet, and inspects the SIWE message Privy asks
 * the wallet to sign.
 *
 * The invariant this guards: Privy emits a scheme-less `domain`
 * (`window.location.host`). ERC-4361 says a missing scheme defaults to
 * `https`, and Brave Wallet enforces that. If the app is served over http,
 * the wallet sees "https://localhost:3000" as the request origin, which
 * differs from the actual origin, and login fails. So the dev origin MUST be
 * HTTPS and the SIWE `URI` MUST equal it.
 *
 * Usage: node scripts/verify-wallet-siwe.mjs
 * Exit 0 = invariant holds; 1 = regression.
 */

import { chromium } from "playwright";

const FRONTEND = process.env.FRONTEND_URL ?? "https://localhost:3000";
const ADDRESS = "0x1111111111111111111111111111111111111111";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

await page.addInitScript(
  ({ address }) => {
    const calls = [];
    window.__walletCalls = calls;

    const provider = {
      isBraveWallet: true,
      chainId: "0x1",
      selectedAddress: address,
      request({ method, params }) {
        calls.push({ method, params });
        switch (method) {
          case "eth_chainId":
            return Promise.resolve("0x1");
          case "net_version":
            return Promise.resolve("1");
          case "eth_accounts":
          case "eth_requestAccounts":
            return Promise.resolve([address]);
          case "personal_sign":
            return Promise.resolve(`0x${"ab".repeat(65)}`);
          case "eth_signTypedData_v4":
          case "eth_signTypedData":
            return Promise.resolve(`0x${"cd".repeat(65)}`);
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
            return Promise.resolve(null);
          default:
            return Promise.resolve(null);
        }
      },
      on() {},
      removeListener() {},
      once() {},
      isConnected: () => true,
    };

    Object.defineProperty(window, "ethereum", { value: provider, configurable: true });

    const info = {
      uuid: "11111111-2222-3333-4444-555555555555",
      name: "Brave Wallet",
      icon: "data:image/svg+xml;base64,PHN2Zy8+",
      rdns: "com.brave.wallet",
    };
    const announce = () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: Object.freeze({ info, provider }),
        }),
      );
    window.addEventListener("eip6963:requestProvider", announce);
    setTimeout(announce, 0);
    setTimeout(announce, 300);
  },
  { address: ADDRESS },
);

const result = {
  origin: null,
  siweDomain: null,
  siweUri: null,
  checks: {},
  error: null,
};

try {
  await page.goto(`${FRONTEND}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  result.origin = await page.evaluate(() => window.location.origin);

  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForTimeout(1500);

  await page.getByText(/continue with a wallet/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  await page.getByText(/brave wallet/i).first().click({ timeout: 15_000 });

  await page.waitForTimeout(4000);
  const calls = await page.evaluate(() => window.__walletCalls ?? []);
  const sign = calls.find((c) => c.method === "personal_sign");
  if (!sign) throw new Error("wallet was never asked to sign a SIWE message");

  const raw = String(sign.params?.[0] ?? "");
  const text = raw.startsWith("0x")
    ? Buffer.from(raw.slice(2), "hex").toString("utf8")
    : raw;

  const [firstLine] = text.split("\n");
  result.siweDomain = firstLine.split(" wants you to sign in")[0].trim();
  result.siweUri = (text.match(/^URI:\s*(.+)$/m) ?? [])[1] ?? null;
  result.message = text;

  const expectedHost = new URL(result.origin).host;
  result.checks.originIsHttps = result.origin.startsWith("https://");
  result.checks.schemeLessDomainMatchesHost = result.siweDomain === expectedHost;
  result.checks.uriMatchesOrigin = result.siweUri === result.origin;
} catch (err) {
  result.error = err.message;
} finally {
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));

const ok =
  !result.error && Object.values(result.checks).every(Boolean);
console.log(ok ? "\nPASS — SIWE domain/URI are consistent with the HTTPS dev origin." : "\nFAIL");
process.exit(ok ? 0 : 1);
