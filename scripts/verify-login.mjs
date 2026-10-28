#!/usr/bin/env node
/**
 * Headless check that the real Privy wiring works in a browser.
 *
 * Loads /login over HTTPS, clicks the sign-in button, and waits for the Privy
 * modal (served from auth.privy.io in an iframe). Reports console errors and
 * page exceptions so a broken provider is caught before a human ever logs in.
 *
 * Also asserts the runtime origin is HTTPS: Sign-In with Ethereum's `domain`
 * check defaults a scheme-less domain to `https` (ERC-4361), so the app must
 * be served over HTTPS for external-wallet login to pass the wallet's origin
 * check on localhost.
 *
 * Usage: node scripts/verify-login.mjs
 */

import { chromium } from "playwright";

const FRONTEND = process.env.FRONTEND_URL ?? "https://localhost:3000";

const browser = await chromium.launch({ headless: true });
// The dev server uses a locally generated (self-signed) certificate.
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(err.message));

const result = {
  url: `${FRONTEND}/login`,
  title: null,
  origin: null,
  secureContext: false,
  button: false,
  privyFrame: false,
};

try {
  await page.goto(result.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  result.title = await page.title();
  result.origin = await page.evaluate(() => window.location.origin);
  result.secureContext = await page.evaluate(() => window.isSecureContext);

  const button = page.getByRole("button", { name: /sign in/i }).first();
  await button.waitFor({ state: "visible", timeout: 15_000 });
  result.button = true;

  await button.click();

  const frame = page.locator('iframe[src*="privy"]').first();
  await frame.waitFor({ state: "attached", timeout: 20_000 });
  const src = await frame.getAttribute("src");
  result.privyFrame = true;
  result.privyFrameHost = src ? new URL(src).origin : null;
} catch (err) {
  result.error = err.message;
} finally {
  await browser.close();
}

result.consoleErrors = consoleErrors;
result.pageErrors = pageErrors;

console.log(JSON.stringify(result, null, 2));

const ok =
  result.origin?.startsWith("https://") &&
  result.secureContext &&
  result.button &&
  result.privyFrame &&
  pageErrors.length === 0;
process.exit(ok ? 0 : 1);
