/**
 * Visual-regression snapshots of the public pages (no login needed).
 *
 *   node e2e/screenshots/capture.mjs <baseUrl> <outDir>
 *   node e2e/screenshots/capture.mjs http://localhost:3100 e2e/screenshots/baseline
 *
 * Signed-in workspace pages need a captured Privy session (see
 * scripts/capture-sessions.mjs) and a live backend, so they are not covered here.
 * Animations are disabled and a fixed viewport is used so runs are comparable.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const [baseUrl = "http://localhost:3100", outDir = "e2e/screenshots/current"] =
  process.argv.slice(2);

const PAGES = [
  ["landing", "/"],
  ["login", "/login"],
  ["signup", "/signup"],
  ["onboarding", "/onboarding"],
  ["how-it-works", "/how-it-works"],
  ["platform", "/platform"],
  ["solutions", "/solutions"],
  ["explore", "/explore"],
  ["about", "/about"],
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  ignoreHTTPSErrors: true,
});

for (const [name, path] of PAGES) {
  const page = await context.newPage();
  await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}video{visibility:hidden!important}",
  });
  // Privy initialises asynchronously and keeps auth buttons disabled until it
  // is ready; wait for that so runs compare the settled page, not a loading one.
  await page
    .waitForFunction(() => !document.querySelector("main button[disabled]"), null, {
      timeout: 15_000,
    })
    .catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  console.log(`captured ${name} (${page.url()})`);
  await page.close();
}

await browser.close();
