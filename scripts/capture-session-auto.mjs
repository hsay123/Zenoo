#!/usr/bin/env node
/**
 * Capture an authenticated browser session WITHOUT manual interaction.
 *
 * Privy's email OTP path cannot be automated, but its external-wallet path can:
 * we announce a mock EIP-6963 wallet whose signatures are produced by a local
 * secp256k1 key (via `viem`) instead of being faked. Privy then completes a real
 * SIWE login and issues a real session, which we save as a Playwright
 * storageState file. The signatures are genuine, the session is genuine — only
 * the "wallet" is a local key we control.
 *
 * The key lives in playwright/.auth/wallet-<role>.key (gitignored) and is
 * generated on first use. Each run logs into the same Privy user for that key.
 *
 * Usage: node scripts/capture-session-auto.mjs <role>
 *        node scripts/capture-session-auto.mjs contributor
 *
 * After capture, promote the same wallet's user to the role under test with:
 *   (cd backend && npx tsx scripts/set-role.ts <wallet-address> <role>)
 */

import { chromium } from "playwright";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import fs from "node:fs";
import path from "node:path";

const FRONTEND = process.env.FRONTEND_URL ?? "https://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "playwright", ".auth");

const role = process.argv[2] ?? "contributor";
// One stable key per role, so buyer/contributor/reviewer/admin are distinct
// platform users (real wallets) rather than one account flipping roles.
const KEY_FILE = path.join(OUT_DIR, `wallet-${role}.key`);

function loadOrCreateKey() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, "utf8").trim();
  const key = generatePrivateKey();
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
  return key;
}

const account = privateKeyToAccount(loadOrCreateKey());
console.log(`Wallet address: ${account.address}`);
console.log(`Capturing session for role: ${role}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") {
    console.log(`  [page error] ${message.text().slice(0, 200)}`);
  }
});

// Real signatures, produced in Node by the local key and handed back to the
// in-page mock provider through Playwright's function bridge.
await page.exposeFunction("__e2eSignMessage", async (payload) => {
  if (typeof payload === "string" && /^0x[0-9a-fA-F]*$/.test(payload)) {
    return account.signMessage({ message: { raw: payload } });
  }
  return account.signMessage({ message: String(payload) });
});
await page.exposeFunction("__e2eSignTypedData", async (payload) => {
  const typedData = typeof payload === "string" ? JSON.parse(payload) : payload;
  return account.signTypedData(typedData);
});

await page.addInitScript(
  ({ address }) => {
    const provider = {
      isBraveWallet: true,
      isMetaMask: true,
      chainId: "0x1",
      selectedAddress: address,
      async request({ method, params }) {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [address];
          case "eth_chainId":
            return "0x1";
          case "net_version":
            return "1";
          case "personal_sign":
            return window.__e2eSignMessage(params?.[0]);
          case "eth_sign":
            return window.__e2eSignMessage(params?.[1]);
          case "eth_signTypedData_v4":
          case "eth_signTypedData":
            return window.__e2eSignTypedData(params?.[1]);
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
          case "wallet_getCapabilities":
            return method === "wallet_getCapabilities" ? {} : null;
          default:
            return null;
        }
      },
      on: () => {},
      removeListener: () => {},
      onchainChanged: () => {},
    };

    Object.defineProperty(window, "ethereum", {
      value: provider,
      configurable: true,
    });

    const info = {
      uuid: "00000000-0000-4000-8000-000000000001",
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
    setTimeout(announce, 1000);
  },
  { address: account.address },
);

try {
  await page.goto(`${FRONTEND}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForTimeout(1500);

  await page.getByText(/continue with a wallet/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(1000);

  await page.getByText(/brave wallet/i).first().click({ timeout: 15_000 });

  await page.waitForURL(
    (url) =>
      /\/(workspace|onboarding)(\/|$)/.test(url.pathname) || url.pathname === "/",
    { timeout: 90_000 },
  );
  // Let Privy finish persisting its session (token rotation) before snapshotting.
  await page.waitForTimeout(2500);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${role}.json`);
  await context.storageState({ path: outFile });
  console.log(`Saved ${outFile}`);

  // Verify the captured session actually resolves against the platform API.
  const probe = await context.newPage();
  await probe.goto(`${FRONTEND}/workspace`, { waitUntil: "domcontentloaded" });
  const me = await probe.evaluate(async () => {
    const token = Object.entries(window.localStorage).length; // touch storage
    void token;
    return null;
  });
  void me;
  await probe.waitForTimeout(3000);
  const text = await probe.locator("body").innerText();
  if (/·\s*(buyer|contributor|reviewer|admin)/i.test(text)) {
    console.log("Verified: captured session resolves to a signed-in workspace.");
  } else {
    console.warn(
      "Warning: session did not resolve within 3s; it may need a moment or the role may not be set yet.",
    );
  }
  console.log(`\nAddress for role promotion: ${account.address}`);
} finally {
  await browser.close();
}
