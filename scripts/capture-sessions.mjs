#!/usr/bin/env node
/**
 * Capture authenticated browser sessions for the four roles (Phase 0.4 / Phase 4).
 *
 * Option B flow: this opens a HEADED browser, you log in once per role in the
 * window (email OTP / Privy test code), and the script saves the session to
 * playwright/.auth/<role>.json (gitignored). Those files are then reused by the
 * Playwright E2E specs via storageState.
 *
 * Prereqs:
 *   npm i -D playwright && npx playwright install chromium   (in the repo root)
 *   backend running on :3010, frontend on :3000 (HTTPS, `npm run dev`)
 *   backend/.env.test.local with TEST_ACCOUNTS (used only to print which email to use)
 *
 * Usage: node scripts/capture-sessions.mjs [role ...]
 *        node scripts/capture-sessions.mjs buyer contributor
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const FRONTEND = process.env.FRONTEND_URL ?? "https://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "playwright", ".auth");
const ALL_ROLES = ["buyer", "contributor", "reviewer", "admin"];

function loadTestAccounts() {
  const file = path.join("backend", ".env.test.local");
  if (!fs.existsSync(file)) return {};
  const line = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("TEST_ACCOUNTS="));
  if (!line) return {};
  try {
    return JSON.parse(line.slice(line.indexOf("=") + 1).trim());
  } catch {
    return {};
  }
}

async function capture(role, email) {
  const browser = await chromium.launch({ headless: false });
  // Dev server uses a locally generated (self-signed) certificate.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(`${FRONTEND}/login`, { waitUntil: "domcontentloaded" });

  console.log(
    `\n>>> Log in as ${role}${email ? ` (${email})` : ""} in the opened window.`,
  );
  console.log("    Waiting until you reach an authenticated page…");

  try {
    // Any of these landing paths means the session is live.
    await page.waitForURL(
      (url) =>
        /\/(workspace|onboarding)(\/|$)/.test(url.pathname) ||
        url.pathname === "/",
      { timeout: 5 * 60 * 1000 },
    );
  } catch {
    console.warn(`    Timed out waiting for ${role}; saving whatever state exists.`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${role}.json`);
  await context.storageState({ path: outFile });
  console.log(`    Saved ${outFile}`);
  await browser.close();
}

async function main() {
  const requested = process.argv.slice(2);
  const roles = requested.length ? requested : ALL_ROLES;
  const accounts = loadTestAccounts();

  for (const role of roles) {
    if (!(role in accounts) && Object.keys(accounts).length) {
      console.warn(`(no TEST_ACCOUNTS entry for '${role}')`);
    }
    await capture(role, accounts[role]);
  }
  console.log("\nDone. Sessions in playwright/.auth/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
