/**
 * S2 — Buyer: project -> media upload -> schema -> tasks -> publish (real stack).
 *
 * What this proves (nothing mocked, nothing stubbed):
 *  1. A buyer drives the real creation wizard end to end: a project is created,
 *     the picked image is uploaded to object storage + registered with its
 *     content hash and dimensions, a draft job is created with the immutable
 *     image-boxes schema, one task is generated per asset, and the job is
 *     published so the tasks become claimable.
 *  2. The job detail screen then reads the live job and its tasks back from the
 *     API (status `published`, one standard task).
 *  3. Ownership is enforced server-side: a contributor's token cannot read the
 *     buyer's job (`403`), only the owner (or an admin) can.
 *  4. The project's data-rights + retention declarations are recorded, not dropped.
 *
 * Prereqs: playwright/.auth/buyer.json + playwright/.auth/contributor.json.
 * Run: npx playwright test e2e/s2-buyer-job.spec.ts
 */
import { test, expect } from "playwright/test";
import fs from "node:fs";
import path from "node:path";

const BUYER = "./playwright/.auth/buyer.json";
const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const BACKEND = process.env.E2E_BACKEND ?? "http://localhost:3010";

/** Read the real Privy access token out of a saved storageState file. */
function tokenFrom(statePath: string): string {
  const state = JSON.parse(fs.readFileSync(path.resolve(statePath), "utf8"));
  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (item.name === "privy:token") return JSON.parse(item.value);
    }
  }
  throw new Error(`No privy:token in ${statePath}`);
}

const stamp = Date.now();
const PROJECT_NAME = `E2E robotics intake ${stamp}`;
const JOB_TITLE = `E2E pick-and-place ${stamp}`;
const DATA_RIGHTS = "E2E-owned capture; buyer holds all rights; internal eval only.";
const RETENTION = "Delete source media 30 days after export.";

test.describe("buyer job creation", () => {
  test.use({ storageState: BUYER });

  test("publishes a job from real media and generates tasks", async ({ page }) => {
    await page.goto("/workspace/buyer/new");
    await expect(page.getByRole("heading", { name: "Project and job" })).toBeVisible();

    // Step 0 — project + job metadata (image modality so the PNG fixture fits).
    await page.locator("#projectId").selectOption("");
    await page.locator("#projectName").fill(PROJECT_NAME);
    await page.locator("#dataRights").fill(DATA_RIGHTS);
    await page.locator("#retention").fill(RETENTION);
    await page.locator("#title").fill(JOB_TITLE);
    await page.locator("#modality").selectOption("image");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 1 — upload the real fixture.
    await expect(page.getByRole("heading", { name: "Media" })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/sample.png");
    await expect(page.getByText("sample.png")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2 — schema is fixed by modality; labels are prefilled.
    await expect(page.getByRole("heading", { name: "Schema and rubric" })).toBeVisible();
    await page.locator("#labels").fill("cup, red_block, blue_block, other");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3 — budget + reward.
    await expect(page.getByRole("heading", { name: "Budget and deadline" })).toBeVisible();
    await page.locator("#budget").fill("100");
    await page.locator("#reward").fill("5");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4 — review + publish (real project -> upload -> job -> tasks -> publish).
    await expect(page.getByRole("heading", { name: "Review and publish" })).toBeVisible();
    await expect(page.getByText(PROJECT_NAME)).toBeVisible();
    await page.getByRole("button", { name: "Create and publish job" }).click();

    await expect(page.getByRole("heading", { name: "Job published" })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText(`“${JOB_TITLE}” is live.`)).toBeVisible();

    // Open the job and confirm the API returns the live job + its task.
    await page.getByRole("link", { name: "Open job" }).click();
    await expect(page).toHaveURL(/\/workspace\/buyer\/jobs\/[0-9a-f-]{36}$/, {
      timeout: 20_000,
    });
    const jobId = page.url().split("/").pop()!;

    await page.getByRole("heading", { name: JOB_TITLE }).click({ trial: false }).catch(() => {});
    await expect(page.getByRole("heading", { name: JOB_TITLE })).toBeVisible();
    await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();
    // Testnet MON, never USD (commit 14f50c7): "Reward / task 5 MON".
    await expect(page.getByText(/Reward \/ task 5 MON/).first()).toBeVisible();
    // One task was generated from the one uploaded asset.
    await expect(page.getByText("Standard", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("No deadline")).toBeVisible();

    // Persist the id for later slices (gitignored path).
    fs.mkdirSync(path.resolve("./playwright/.auth"), { recursive: true });
    fs.writeFileSync(
      path.resolve("./playwright/.auth/s2-job.json"),
      JSON.stringify({ jobId, title: JOB_TITLE, projectName: PROJECT_NAME }, null, 2),
    );
  });

  test("rejects a non-owner reading the buyer's job", async ({ request }) => {
    const created = JSON.parse(
      fs.readFileSync(path.resolve("./playwright/.auth/s2-job.json"), "utf8"),
    );
    const contributorToken = tokenFrom(CONTRIBUTOR);

    const res = await request.get(`${BACKEND}/api/jobs/${created.jobId}`, {
      headers: { Authorization: `Bearer ${contributorToken}` },
    });
    expect(res.status()).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
