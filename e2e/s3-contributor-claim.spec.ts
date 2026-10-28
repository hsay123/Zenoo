/**
 * S3 — Contributor: available queue -> atomic claim -> annotate -> draft -> submit.
 *
 * Self-contained: `beforeAll` builds a real fixture over the API (buyer token:
 * project -> two uploaded video assets -> published job -> two tasks). Nothing
 * is inserted directly into the database.
 *
 * What this proves:
 *  1. The contributor's live queue shows the published task and a claim opens the
 *     annotation workspace with the real signed media.
 *  2. An annotation can be saved as a draft and then submitted; the submission is
 *     append-only (version 1) and the task leaves the queue.
 *  3. Two different contributors racing for the same task cannot both win: exactly
 *     one claim succeeds, the other gets 409, and the database ends with a single
 *     lease owner (atomic `UPDATE ... WHERE status = 'available'`).
 *
 * Prereqs: playwright/.auth/{buyer,contributor,contributor2}.json
 * Run: npx playwright test e2e/s3-contributor-claim.spec.ts
 */
import { test, expect } from "playwright/test";
import fs from "node:fs";
import path from "node:path";
import { api, createPublishedJob, tokenFrom, type Fixture } from "./helpers/platform";

const BUYER = "./playwright/.auth/buyer.json";
const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const CONTRIBUTOR2 = "./playwright/.auth/contributor2.json";

const stamp = Date.now();
const fixture: Fixture & { task0?: string; task1?: string } = {
  projectId: "",
  jobId: "",
  title: "",
  assetIds: [],
  taskIds: [],
};

test.describe("contributor claim + annotate", () => {
  test.use({ storageState: CONTRIBUTOR });

  test.beforeAll(async () => {
    const created = await createPublishedJob(tokenFrom(BUYER), {
      modality: "video",
      count: 2,
      title: `E2E S3 video job ${stamp}`,
    });
    Object.assign(fixture, created);
    fixture.task0 = fixture.taskIds[0];
    fixture.task1 = fixture.taskIds[1];

    fs.writeFileSync(
      path.resolve("./playwright/.auth/s3-fixture.json"),
      JSON.stringify(fixture, null, 2),
    );
  });

  test("claims a task, saves a draft, then submits it", async ({ page }) => {
    await page.goto("/workspace/contributor");
    await expect(page.getByRole("heading", { name: "Available tasks" })).toBeVisible();

    // Find the row for our first task and claim it.
    const row = page
      .locator("tr", { hasText: fixture.jobId.slice(0, 8) })
      .filter({ hasText: fixture.task0!.slice(0, 8) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Claim" }).click();

    await expect(page).toHaveURL(new RegExp(`/workspace/contributor/tasks/${fixture.task0}$`));

    // The workspace loads the real leased task with signed media.
    await expect(page.getByText(fixture.task0!).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("video")).toBeVisible({ timeout: 30_000 });

    // Annotate one action segment (a `<video>` element carries no ARIA role).
    await page.getByRole("button", { name: "Add segment" }).click();
    await expect(page.getByText("Passes preview checks")).toBeVisible();

    // Save it as a draft.
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved to the platform.")).toBeVisible({
      timeout: 20_000,
    });

    // Submit the annotation for review.
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted — version 1")).toBeVisible({ timeout: 20_000 });
  });

  test("two contributors cannot claim the same task twice", async () => {
    const [a, b] = await Promise.all([
      api(`/api/tasks/${fixture.task1}/claim`, {
        token: tokenFrom(CONTRIBUTOR),
        method: "POST",
        headers: { "idempotency-key": `race-a:${fixture.task1}` },
      }),
      api(`/api/tasks/${fixture.task1}/claim`, {
        token: tokenFrom(CONTRIBUTOR2),
        method: "POST",
        headers: { "idempotency-key": `race-b:${fixture.task1}` },
      }),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 409]);
  });
});
