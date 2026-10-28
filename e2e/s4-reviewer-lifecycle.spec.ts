/**
 * S4 — Reviewer: review queue -> accept / revise / reject -> correction -> appeal.
 *
 * Self-contained: `beforeAll` builds a published video job over the real API and
 * has a real contributor (via the API) claim + submit version 1, so the task is in
 * the human review queue. The tests then run the full lifecycle:
 *
 *   1. reviewer requests a revision           (human `revise` / IMPRECISE_TIMING)
 *   2. contributor corrects and resubmits      (append-only version 2)
 *   3. reviewer rejects version 2              (human `reject` / RUBRIC_VIOLATION)
 *   4. contributor files an appeal             (rejected -> appealed)
 *   5. reviewer upholds the appeal             (appealed -> accepted, APPEAL_UPHELD)
 *   6. role boundary: a contributor cannot record a review decision (403/401)
 *
 * Video tasks always route to the human queue (the AI first pass only covers
 * eligible images), so the queue is deterministic here.
 *
 * Prereqs: playwright/.auth/{buyer,contributor,reviewer}.json
 * Run: npx playwright test e2e/s4-reviewer-lifecycle.spec.ts
 */
import { test, expect, type Browser } from "playwright/test";
import fs from "node:fs";
import path from "node:path";
import { api, createPublishedJob, tokenFrom } from "./helpers/platform";

const BUYER = "./playwright/.auth/buyer.json";
const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const REVIEWER = "./playwright/.auth/reviewer.json";
const BASE = "https://localhost:3000";

const stamp = Date.now();
const fixture = {
  projectId: "",
  jobId: "",
  title: "",
  assetId: "",
  taskId: "",
  submissionId: "",
};

async function openAs(browser: Browser, statePath: string) {
  const context = await browser.newContext({
    storageState: statePath,
    baseURL: BASE,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  return { context, page };
}

test.beforeAll(async () => {
  const created = await createPublishedJob(tokenFrom(BUYER), {
    modality: "video",
    count: 1,
    title: `E2E S4 reviewer intake ${stamp}`,
  });
  const taskId = created.taskIds[0];
  const assetId = created.assetIds[0];
  const contributor = tokenFrom(CONTRIBUTOR);

  const claim = await api(`/api/tasks/${taskId}/claim`, {
    token: contributor,
    method: "POST",
    headers: { "idempotency-key": `s4-claim:${taskId}` },
  });
  expect(claim.status, claim.text).toBe(200);

  const submit = await api(`/api/tasks/${taskId}/submit`, {
    token: contributor,
    method: "POST",
    headers: { "idempotency-key": `s4-submit:${taskId}` },
    body: {
      task_id: taskId,
      asset_id: assetId,
      schema_version: "action-segments-v1",
      segments: [
        {
          start_ms: 0,
          end_ms: 400,
          action_label: "reach",
          outcome: "success",
          confidence: 3,
        },
      ],
    },
  });
  expect(submit.status, submit.text).toBe(201);

  Object.assign(fixture, {
    projectId: created.projectId,
    jobId: created.jobId,
    title: created.title,
    assetId,
    taskId,
    submissionId: (submit.json.data as { id: string }).id,
  });
  fs.writeFileSync(
    path.resolve("./playwright/.auth/s4-fixture.json"),
    JSON.stringify(fixture, null, 2),
  );
});

test("reviewer requests a revision for version 1", async ({ browser }) => {
  const { context, page } = await openAs(browser, REVIEWER);
  try {
    await page.goto("/workspace/reviewer");
    const row = page.locator("tr", { hasText: fixture.title });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("link", { name: "Review" }).click();

    await expect(page).toHaveURL(new RegExp(`/workspace/reviewer/review/${fixture.taskId}$`));
    await expect(page.getByRole("heading", { name: fixture.title })).toBeVisible();
    await expect(page.locator("video")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Request revision" }).click();
    await page.getByRole("combobox").first().selectOption("IMPRECISE_TIMING");
    await page
      .locator("#decision-notes")
      .fill("The reach segment ends before the hand leaves the frame.");
    await page.getByRole("button", { name: "Record decision" }).click();

    await expect(page.getByText("Decision recorded")).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test("contributor corrects the annotation and resubmits as version 2", async ({ browser }) => {
  const { context, page } = await openAs(browser, CONTRIBUTOR);
  try {
    await page.goto(`/workspace/contributor/tasks/${fixture.taskId}`);
    await expect(page.locator("video")).toBeVisible({ timeout: 30_000 });

    // The editor is prefilled from the frozen version 1; change the label so the
    // new payload is a genuine correction (not a duplicate payload).
    await page.getByLabel("Action").first().selectOption("grasp");
    await page.getByRole("button", { name: "Submit for review" }).click();

    await expect(page.getByText("Submitted — version 2")).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test("reviewer rejects version 2", async ({ browser }) => {
  const { context, page } = await openAs(browser, REVIEWER);
  try {
    await page.goto("/workspace/reviewer");
    const row = page.locator("tr", { hasText: fixture.title });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("link", { name: "Review" }).click();

    await expect(page).toHaveURL(new RegExp(`/workspace/reviewer/review/${fixture.taskId}$`));
    await page.getByRole("button", { name: "Reject" }).click();
    await page.getByRole("combobox").first().selectOption("RUBRIC_VIOLATION");
    await page.locator("#decision-notes").fill("Does not follow the annotation rubric.");
    await page.getByRole("button", { name: "Record decision" }).click();

    await expect(page.getByText("Decision recorded")).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test("contributor files an appeal against the rejected version", async ({ browser }) => {
  const { context, page } = await openAs(browser, CONTRIBUTOR);
  try {
    await page.goto("/workspace/contributor/submissions");
    await expect(page.getByRole("heading", { name: "Rejected work" })).toBeVisible({
      timeout: 20_000,
    });

    const card = page.locator("li", { hasText: fixture.title });
    await card.locator('textarea[id^="appeal-"]').fill(
      "The label matches the action in the clip; please re-check the segment.",
    );
    await card.getByRole("button", { name: "File appeal" }).click();

    // The queue reloads after the appeal is filed: the task moves from
    // "rejected" to "appealed" in the history table.
    const row = page.locator("tr", { hasText: fixture.title });
    await expect(row.getByText("Appealed")).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test("reviewer upholds the appeal and the task becomes accepted", async ({ browser }) => {
  const { context, page } = await openAs(browser, REVIEWER);
  try {
    await page.goto("/workspace/reviewer/disputes");
    const card = page.locator("li", { hasText: fixture.title });
    await expect(card).toBeVisible({ timeout: 20_000 });

    await card
      .locator('textarea[id^="appeal-notes-"]')
      .fill("Re-watched the clip; the segment is correct, so the rejection is reversed.");
    await card.getByRole("button", { name: "Uphold appeal" }).click();

    // A decided appeal leaves the open queue; its outcome stays visible in the
    // session banner rather than on the (now unmounted) card.
    await expect(page.getByText("Appeal adjudicated")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/→ accepted/)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a contributor cannot record a review decision", async () => {
  const contributor = tokenFrom(CONTRIBUTOR);

  const forbidden = await api(`/api/reviews/${fixture.submissionId}/decision`, {
    token: contributor,
    method: "POST",
    body: { decision: "accept", reason_code: "ACCEPTED" },
  });
  expect(forbidden.status, forbidden.text).toBe(403);

  const anonymous = await api(`/api/reviews/${fixture.submissionId}/decision`, {
    method: "POST",
    body: { decision: "accept", reason_code: "ACCEPTED" },
  });
  expect(anonymous.status).toBe(401);
});
