/**
 * S5 — Settlement receipt + accepted-only export.
 *
 * Self-contained: `beforeAll` builds a published two-task video job over the real
 * API, has a real contributor claim + submit one task, a real reviewer accept it,
 * and a real admin settle it. Video always routes to human review, so the accepted
 * set is deterministic. The tests then verify:
 *
 *   1. export is accepted-versions-only, provenance manifest, no contributor identity
 *   2. the buyer can stream a real download from the export screen
 *   3. settlement writes a public receipt (no auth), labelled by its mode:
 *      "Mock settlement" with the mock service, "On-chain settlement" with a
 *      real tx hash when the backend settles on Base Sepolia
 *   4. the contributor's earnings row links to that receipt with the same label
 *   5. role boundaries: contributor cannot export another buyer's job (403) or
 *      settle (403); anonymous is 401
 *
 * Prereqs: playwright/.auth/{buyer,contributor,reviewer,admin}.json
 * Run: npx playwright test e2e/s5-receipts-export.spec.ts
 */
import { test, expect, type Browser } from "playwright/test";
import fs from "node:fs";
import path from "node:path";
import { api, createPublishedJob, tokenFrom } from "./helpers/platform";

const BUYER = "./playwright/.auth/buyer.json";
const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const REVIEWER = "./playwright/.auth/reviewer.json";
const ADMIN = "./playwright/.auth/admin.json";
const BASE = "https://localhost:3000";

const stamp = Date.now();
const fixture = {
  projectId: "",
  jobId: "",
  title: "",
  acceptedTaskId: "",
  idleTaskId: "",
  submissionId: "",
  receiptId: "",
  contributorId: "",
  receiptIsMock: true,
};

async function openAs(
  browser: Browser,
  statePath?: string,
) {
  const context = await browser.newContext({
    ...(statePath ? { storageState: statePath } : {}),
    baseURL: BASE,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  return { context, page };
}

test.beforeAll(async () => {
  const buyer = tokenFrom(BUYER);
  const contributor = tokenFrom(CONTRIBUTOR);
  const reviewer = tokenFrom(REVIEWER);
  const admin = tokenFrom(ADMIN);

  const created = await createPublishedJob(buyer, {
    modality: "video",
    count: 2,
    title: `E2E S5 delivery ${stamp}`,
  });
  const acceptedTaskId = created.taskIds[0];
  const idleTaskId = created.taskIds[1];
  const assetId = created.assetIds[0];

  const me = await api("/api/me", { token: contributor });
  expect(me.status, me.text).toBe(200);
  const contributorId = (me.json.data as { id: string }).id;

  const claim = await api(`/api/tasks/${acceptedTaskId}/claim`, {
    token: contributor,
    method: "POST",
    headers: { "idempotency-key": `s5-claim:${acceptedTaskId}` },
  });
  expect(claim.status, claim.text).toBe(200);

  const submit = await api(`/api/tasks/${acceptedTaskId}/submit`, {
    token: contributor,
    method: "POST",
    headers: { "idempotency-key": `s5-submit:${acceptedTaskId}` },
    body: {
      task_id: acceptedTaskId,
      asset_id: assetId,
      schema_version: "action-segments-v1",
      segments: [
        {
          start_ms: 0,
          end_ms: 500,
          action_label: "grasp",
          outcome: "success",
          confidence: 3,
        },
      ],
    },
  });
  expect(submit.status, submit.text).toBe(201);
  const submissionId = (submit.json.data as { id: string }).id;

  const accept = await api(`/api/reviews/${submissionId}/decision`, {
    token: reviewer,
    method: "POST",
    body: { decision: "accept", reason_code: "ACCEPTED" },
  });
  expect(accept.status, accept.text).toBe(200);

  const settle = await api("/api/settlement/accept", {
    token: admin,
    method: "POST",
    headers: { "idempotency-key": `s5-settle:${acceptedTaskId}` },
    body: { task_id: acceptedTaskId, submission_id: submissionId },
  });
  expect(settle.status, settle.text).toBe(200);
  const receiptId = (settle.json.data as { id: string }).id;

  Object.assign(fixture, {
    projectId: created.projectId,
    jobId: created.jobId,
    title: created.title,
    acceptedTaskId,
    idleTaskId,
    submissionId,
    receiptId,
    contributorId,
  });
  fs.writeFileSync(
    path.resolve("./playwright/.auth/s5-fixture.json"),
    JSON.stringify(fixture, null, 2),
  );
});

test("buyer export contains only the accepted version, with provenance and no identity", async () => {
  const buyer = tokenFrom(BUYER);

  const res = await api(`/api/jobs/${fixture.jobId}/export?format=json`, {
    token: buyer,
  });
  expect(res.status, res.text).toBe(200);

  const body = JSON.parse(res.text) as {
    manifest: { record_counts: { total: number; video: number } };
    records: Array<{ task_id: string; reviewer_type: string }>;
  };
  expect(body.manifest.record_counts.total).toBe(1);
  expect(body.manifest.record_counts.video).toBe(1);
  expect(body.records.map((r) => r.task_id)).toEqual([fixture.acceptedTaskId]);
  // The still-open second task must not leak into the export.
  expect(res.text).not.toContain(fixture.idleTaskId);
  // No contributor identity anywhere in the payload.
  expect(res.text).not.toContain(fixture.contributorId);
});

test("buyer streams a real file download from the export screen", async ({ browser }) => {
  const { context, page } = await openAs(browser, BUYER);
  try {
    await page.goto(`/workspace/buyer/jobs/${fixture.jobId}/export`);

    await expect(page.getByRole("heading", { name: "Dataset export" })).toBeVisible({
      timeout: 20_000,
    });
    // The manifest read is the real export body (accepted-only).
    const manifest = page.locator("section", { hasText: "Provenance manifest" });
    await expect(manifest.getByText("Records")).toBeVisible({ timeout: 20_000 });
    await expect(manifest.locator('dt:text-is("Records") + dd')).toHaveText("1");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  } finally {
    await context.close();
  }
});

test("settlement writes a public receipt labelled by its mode", async ({ browser }) => {
  // The receipt API is served without auth.
  const publicRes = await api(`/api/receipts/${fixture.receiptId}`);
  expect(publicRes.status, publicRes.text).toBe(200);
  const receipt = publicRes.json.data as {
    id: string;
    task_id: string;
    annotation_hash: string;
    is_mock: boolean;
    tx_hash: string | null;
  };
  expect(receipt.id).toBe(fixture.receiptId);
  expect(receipt.task_id).toBe(fixture.acceptedTaskId);
  expect(receipt.annotation_hash).toMatch(/^0x[0-9a-f]{64}$/);
  fixture.receiptIsMock = receipt.is_mock;
  // A real (non-mock) payout always carries its Base Sepolia tx hash.
  if (!receipt.is_mock) expect(receipt.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);

  // And it renders on a fully anonymous page load.
  const { context, page } = await openAs(browser);
  try {
    await page.goto(`/receipts/${fixture.receiptId}`);
    await expect(page.getByRole("heading", { name: "Payout receipt" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(receipt.is_mock ? "Mock settlement" : "On-chain settlement").first(),
    ).toBeVisible();
    await expect(page.getByText(fixture.receiptId)).toBeVisible();
    await expect(page.getByText(receipt.annotation_hash)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("contributor earnings labels the payout by mode and links to its receipt", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, CONTRIBUTOR);
  try {
    await page.goto("/workspace/contributor/earnings");

    const row = page.locator("tr", { hasText: fixture.title });
    await expect(row).toBeVisible({ timeout: 20_000 });
    const receiptLink = row.getByRole("link", {
      name: fixture.receiptIsMock ? "Mock settlement" : /on-chain ·/,
    });
    await expect(receiptLink).toBeVisible();

    await receiptLink.click();
    await expect(page).toHaveURL(new RegExp(`/receipts/${fixture.receiptId}$`));
    await expect(page.getByRole("heading", { name: "Payout receipt" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("role boundaries: contributor cannot export or settle, anonymous cannot read", async () => {
  const contributor = tokenFrom(CONTRIBUTOR);

  const exportForbidden = await api(`/api/jobs/${fixture.jobId}/export`, {
    token: contributor,
  });
  expect(exportForbidden.status, exportForbidden.text).toBe(403);

  const settleForbidden = await api("/api/settlement/accept", {
    token: contributor,
    method: "POST",
    body: { task_id: fixture.acceptedTaskId, submission_id: fixture.submissionId },
  });
  expect(settleForbidden.status, settleForbidden.text).toBe(403);

  const exportAnonymous = await api(`/api/jobs/${fixture.jobId}/export`);
  expect(exportAnonymous.status).toBe(401);

  const receiptAnonymous = await api(`/api/receipts/${fixture.receiptId}`);
  expect(receiptAnonymous.status).toBe(200);
});
