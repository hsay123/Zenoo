/**
 * S7 — REAL Monad-testnet settlement (live, funded escrow).
 *
 * Not a CI spec: it assumes a funded on-chain `JobEscrow` and a backend that has
 * passed the fail-closed settlement preflight (`mode=chain`). It drives the real
 * product workflow end to end and proves the payout is genuinely on-chain:
 *
 *   contributor  claim -> annotate the video -> save -> reload -> submit
 *   reviewer     accept the exact submission (human review; video always routes
 *                to a human, so no AI first pass is involved)
 *   admin        settle via POST /api/settlement/accept (Zeno's real path)
 *
 * Fixture `playwright/.auth/s7-fixture.json` is created beforehand (real buyer
 * API) and its on-chain job is funded out of band (see the run report).
 *
 * Live-only: skipped by default so the ordinary suite stays green in mock/dev
 * environments.
 * Run: S7_LIVE=1 npx playwright test e2e/s7-real-settlement.spec.ts
 */
import { test, expect, type Browser } from "playwright/test";
import fs from "node:fs";
import path from "node:path";
import { api, tokenFrom } from "./helpers/platform";

const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const REVIEWER = "./playwright/.auth/reviewer.json";
const ADMIN = "./playwright/.auth/admin.json";
const BASE = "https://localhost:3000";
const FIXTURE = path.resolve("./playwright/.auth/s7-fixture.json");
const RESULT = path.resolve("./playwright/.auth/s7-settlement.json");

test.describe.configure({ mode: "serial" });

// Live-only: the default CI suite must stay green in mock/dev environments, so
// this spec self-skips unless explicitly enabled with a funded fixture.
const LIVE = process.env.S7_LIVE === "1" && fs.existsSync(FIXTURE);
test.skip(
  !LIVE,
  "Live on-chain settlement spec; set S7_LIVE=1 with a funded playwright/.auth/s7-fixture.json",
);

const fixture = (LIVE
  ? JSON.parse(fs.readFileSync(FIXTURE, "utf8"))
  : { projectId: "", jobId: "", title: "", assetId: "", taskId: "", reward: "", modality: "" }) as {
  projectId: string;
  jobId: string;
  title: string;
  assetId: string;
  taskId: string;
  reward: string;
  modality: string;
};

let submissionId = "";

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
  // Guard: refuse to run unless the backend is really settling on-chain.
  const report = await api("/api/settlement/preflight", { token: tokenFrom(ADMIN) });
  expect(report.status, report.text).toBe(200);
  const data = report.json.data as { ok: boolean; mode: string; chainId: number | null };
  expect(data.mode, "backend must be in chain mode for S7").toBe("chain");
  expect(data.ok).toBe(true);
  expect(data.chainId).toBe(10143);
});

test("contributor claims, annotates the video, saves, reloads and submits", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, CONTRIBUTOR);
  try {
    const taskId = fixture.taskId;

    const claim = await api(`/api/tasks/${taskId}/claim`, {
      token: tokenFrom(CONTRIBUTOR),
      method: "POST",
      headers: { "idempotency-key": `s7-claim:${taskId}` },
    });
    expect(claim.status, claim.text).toBe(200);

    await page.goto(`/workspace/contributor/tasks/${taskId}`);
    await expect(page.getByRole("heading", { name: fixture.title })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("video")).toBeVisible();

    const slider = page.getByRole("slider", { name: "Video timeline" });
    await expect
      .poll(async () => Number(await slider.getAttribute("aria-valuemax")))
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "Add segment" }).click();
    await expect(page.locator("text=segments[0]")).toBeVisible();

    const track = await slider.boundingBox();
    expect(track).not.toBeNull();
    if (!track) return;

    const startInput = page.getByLabel("Start (ms)", { exact: true });
    const endInput = page.getByLabel("End (ms)", { exact: true });
    await slider.click({ position: { x: 4, y: track.height / 2 } });
    await page.getByRole("button", { name: "Set start" }).click();
    await slider.click({ position: { x: track.width * 0.75, y: track.height / 2 } });
    await page.getByRole("button", { name: "Set end" }).click();
    await expect
      .poll(async () => Number(await endInput.inputValue()))
      .toBeGreaterThan(Number(await startInput.inputValue()));

    const savedStart = Number(await startInput.inputValue());
    const savedEnd = Number(await endInput.inputValue());

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved to the platform.")).toBeVisible({
      timeout: 20_000,
    });

    // Persistence: a hard reload must restore the exact segment.
    await page.reload();
    await expect(page.getByText(/Loaded from your draft/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("text=segments[0]")).toBeVisible();
    expect(Number(await page.getByLabel("Start (ms)", { exact: true }).inputValue())).toBe(
      savedStart,
    );
    expect(Number(await page.getByLabel("End (ms)", { exact: true }).inputValue())).toBe(savedEnd);

    const [submitResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/tasks/${taskId}/submit`) && r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Submit for review" }).click(),
    ]);
    await expect(page.getByText("Submitted — version 1")).toBeVisible({ timeout: 20_000 });
    const submitBody = (await submitResp.json()) as { data: { id: string } };
    submissionId = submitBody.data.id;
    expect(submissionId).toMatch(/^[0-9a-f-]{36}$/);

    const task = await api(`/api/tasks/${taskId}`, { token: tokenFrom(CONTRIBUTOR) });
    expect(task.status, task.text).toBe(200);
    expect((task.json.data as { status: string }).status).toBe("submitted");
  } finally {
    await context.close();
  }
});

test("reviewer accepts that exact submission from the review console", async ({ browser }) => {
  expect(submissionId, "contributor test must have submitted first").not.toBe("");
  const { context, page } = await openAs(browser, REVIEWER);
  try {
    await page.goto("/workspace/reviewer");
    const row = page.locator("tr", { hasText: fixture.title });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("link", { name: "Review" }).click();

    await expect(page).toHaveURL(new RegExp(`/workspace/reviewer/review/${fixture.taskId}$`));
    await expect(page.getByRole("heading", { name: fixture.title })).toBeVisible();
    await expect(page.locator("video")).toBeVisible({ timeout: 30_000 });

    // "accept" is the console's default outcome; the reason code is ACCEPTED.
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByText(/ACCEPTED/)).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test("admin settles the accepted task on-chain and it is real, not mock", async () => {
  expect(submissionId, "reviewer test must have accepted first").not.toBe("");

  const settle = await api("/api/settlement/accept", {
    token: tokenFrom(ADMIN),
    method: "POST",
    headers: { "idempotency-key": `s7-settle:${fixture.taskId}` },
    body: { task_id: fixture.taskId, submission_id: submissionId },
  });
  expect(settle.status, settle.text).toBe(200);
  const receipt = settle.json.data as {
    id: string;
    submission_id: string;
    tx_hash: string | null;
    is_mock: boolean;
  };

  expect(receipt.submission_id).toBe(submissionId);
  expect(receipt.is_mock, "a real payout must never be recorded as mock").toBe(false);
  expect(receipt.tx_hash ?? "", "receipt must carry a real tx hash").toMatch(
    /^0x[0-9a-fA-F]{64}$/,
  );

  // The task only reaches `paid` after receipt + event verification.
  const task = await api(`/api/tasks/${fixture.taskId}`, { token: tokenFrom(CONTRIBUTOR) });
  expect(task.status, task.text).toBe(200);
  expect((task.json.data as { status: string }).status).toBe("paid");

  // The receipt is public and honest.
  const publicReceipt = await api(`/api/receipts/${receipt.id}`);
  expect(publicReceipt.status, publicReceipt.text).toBe(200);
  expect((publicReceipt.json.data as { is_mock: boolean }).is_mock).toBe(false);

  // Reconciliation must be idempotent: nothing left to finalise, no second payout.
  const reconcile = await api("/api/settlement/reconcile", {
    token: tokenFrom(ADMIN),
    method: "POST",
  });
  expect(reconcile.status, reconcile.text).toBe(200);
  const result = reconcile.json.data as { finalized: string[]; unresolved: unknown[] };
  expect(result.finalized).toEqual([]);
  expect(result.unresolved).toEqual([]);

  // Settling the same task again must not create a second payout.
  const again = await api("/api/settlement/accept", {
    token: tokenFrom(ADMIN),
    method: "POST",
    headers: { "idempotency-key": `s7-settle-again:${fixture.taskId}` },
    body: { task_id: fixture.taskId, submission_id: submissionId },
  });
  expect(again.status, again.text).toBe(200);
  const againReceipt = again.json.data as { id: string; tx_hash: string | null; is_mock: boolean };
  expect(againReceipt.id).toBe(receipt.id);
  expect(againReceipt.tx_hash).toBe(receipt.tx_hash);

  fs.writeFileSync(
    RESULT,
    JSON.stringify(
      {
        jobId: fixture.jobId,
        jobTitle: fixture.title,
        taskId: fixture.taskId,
        submissionId,
        reward: fixture.reward,
        receiptId: receipt.id,
        txHash: receipt.tx_hash,
        isMock: receipt.is_mock,
      },
      null,
      2,
    ),
  );
  console.log(`\nS7 settlement result written to ${RESULT}\n`);
});
