/**
 * S6 — Job lifecycle + admin role administration.
 *
 * Self-contained: `beforeAll` builds two published video jobs over the real API
 * (one for the buyer lifecycle walk, one for the admin transition) and reads a
 * dedicated throwaway account (`s6target`) whose role the admin screen will
 * reassign and reset. The tests verify:
 *
 *   1. a buyer pauses, resumes and closes a published job from the job screen
 *   2. an illegal transition is refused with 409 (guarded state machine)
 *   3. lifecycle role boundaries: contributor 403, anonymous 401, admin allowed
 *   4. admin reads are admin-only: contributor 403, anonymous 401, admin 200
 *   5. the admin screen reassigns a role (real PATCH) and the change persists
 *   6. self-demotion is refused (400) and a non-admin is kept out of /workspace/admin
 *
 * Prereqs: playwright/.auth/{buyer,contributor,admin,s6target}.json
 *          (`node scripts/capture-session-auto.mjs s6target` creates the throwaway)
 * Run: npx playwright test e2e/s6-lifecycle-admin.spec.ts
 */
import { test, expect, type Browser } from "playwright/test";
import { api, createPublishedJob, tokenFrom } from "./helpers/platform";

const BUYER = "./playwright/.auth/buyer.json";
const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const ADMIN = "./playwright/.auth/admin.json";
const S6_TARGET = "./playwright/.auth/s6target.json";
const BASE = "https://localhost:3000";

const stamp = Date.now();
const fixture = {
  jobId: "",
  jobTitle: "",
  adminJobId: "",
  adminId: "",
  targetId: "",
  targetWallet: "",
  targetInitialRole: "",
};

async function openAs(browser: Browser, statePath?: string) {
  const context = await browser.newContext({
    ...(statePath ? { storageState: statePath } : {}),
    baseURL: BASE,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  return { context, page };
}

async function jobStatus(token: string, jobId: string): Promise<string> {
  const res = await api(`/api/jobs/${jobId}`, { token });
  expect(res.status, res.text).toBe(200);
  return (res.json.data as { status: string }).status;
}

async function userRole(token: string, userId: string): Promise<string> {
  const res = await api("/api/admin/users?per_page=100", { token });
  expect(res.status, res.text).toBe(200);
  const rows = (res.json.data as { items: { id: string; role: string }[] }).items;
  const found = rows.find((row) => row.id === userId);
  expect(found, `user ${userId} present in the admin list`).toBeTruthy();
  return found!.role;
}

test.beforeAll(async () => {
  const buyer = tokenFrom(BUYER);
  const admin = tokenFrom(ADMIN);

  const job = await createPublishedJob(buyer, {
    modality: "video",
    count: 1,
    title: `E2E S6 lifecycle ${stamp}`,
  });
  const adminJob = await createPublishedJob(buyer, {
    modality: "video",
    count: 1,
    title: `E2E S6 admin ${stamp}`,
  });

  const me = await api("/api/me", { token: admin });
  expect(me.status, me.text).toBe(200);
  const adminId = (me.json.data as { id: string }).id;

  const target = await api("/api/me", { token: tokenFrom(S6_TARGET) });
  expect(target.status, target.text).toBe(200);
  const targetUser = target.json.data as {
    id: string;
    wallet_address: string | null;
    role: string;
  };

  fixture.jobId = job.jobId;
  fixture.jobTitle = job.title;
  fixture.adminJobId = adminJob.jobId;
  fixture.adminId = adminId;
  fixture.targetId = targetUser.id;
  fixture.targetWallet = targetUser.wallet_address ?? "";
  fixture.targetInitialRole = targetUser.role;
});

// Safety net: never leave the throwaway account reassigned if a UI step fails.
test.afterAll(async () => {
  if (!fixture.targetId || !fixture.targetInitialRole) return;
  await api(`/api/admin/users/${fixture.targetId}/role`, {
    token: tokenFrom(ADMIN),
    method: "PATCH",
    body: { role: fixture.targetInitialRole },
  });
});

test("buyer pauses, resumes and closes a published job from the job screen", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, BUYER);
  try {
    await page.goto(`/workspace/buyer/jobs/${fixture.jobId}`);
    await expect(
      page.getByRole("heading", { name: fixture.jobTitle }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Published", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Pause job" }).click();
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();
    expect(await jobStatus(tokenFrom(BUYER), fixture.jobId)).toBe("paused");

    await page.getByRole("button", { name: "Resume job" }).click();
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    expect(await jobStatus(tokenFrom(BUYER), fixture.jobId)).toBe("published");

    await page.getByRole("button", { name: "Close job" }).click();
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
    expect(await jobStatus(tokenFrom(BUYER), fixture.jobId)).toBe("closed");
  } finally {
    await context.close();
  }
});

test("an illegal lifecycle transition is refused (409)", async () => {
  const buyer = tokenFrom(BUYER);
  // The job was closed by the previous test; pause/resume are no longer legal.
  const pause = await api(`/api/jobs/${fixture.jobId}/pause`, {
    token: buyer,
    method: "POST",
  });
  expect(pause.status, pause.text).toBe(409);

  const resume = await api(`/api/jobs/${fixture.jobId}/resume`, {
    token: buyer,
    method: "POST",
  });
  expect(resume.status, resume.text).toBe(409);
});

test("lifecycle role boundaries: contributor 403, anonymous 401, admin allowed", async () => {
  const contributor = await api(`/api/jobs/${fixture.adminJobId}/pause`, {
    token: tokenFrom(CONTRIBUTOR),
    method: "POST",
  });
  expect(contributor.status, contributor.text).toBe(403);

  const anonymous = await api(`/api/jobs/${fixture.adminJobId}/pause`, {
    method: "POST",
  });
  expect(anonymous.status).toBe(401);

  const admin = tokenFrom(ADMIN);
  const paused = await api(`/api/jobs/${fixture.adminJobId}/pause`, {
    token: admin,
    method: "POST",
  });
  expect(paused.status, paused.text).toBe(200);
  expect((paused.json.data as { status: string }).status).toBe("paused");

  const resumed = await api(`/api/jobs/${fixture.adminJobId}/resume`, {
    token: admin,
    method: "POST",
  });
  expect(resumed.status, resumed.text).toBe(200);
  expect((resumed.json.data as { status: string }).status).toBe("published");
});

test("admin reads are admin-only: contributor 403, anonymous 401, admin 200", async () => {
  const contributor = await api("/api/admin/users", { token: tokenFrom(CONTRIBUTOR) });
  expect(contributor.status, contributor.text).toBe(403);

  const anonymous = await api("/api/admin/users");
  expect(anonymous.status).toBe(401);

  const admin = await api("/api/admin/users?per_page=100", { token: tokenFrom(ADMIN) });
  expect(admin.status, admin.text).toBe(200);
  const items = (admin.json.data as { items: { id: string }[] }).items;
  expect(items.some((row) => row.id === fixture.targetId)).toBe(true);
});

test("the admin screen reassigns a role and the change persists", async ({ browser }) => {
  expect(fixture.targetWallet).not.toBe("");
  const initial = fixture.targetInitialRole;
  const next = initial === "reviewer" ? "contributor" : "reviewer";

  const { context, page } = await openAs(browser, ADMIN);
  try {
    await page.goto("/workspace/admin");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
      timeout: 20_000,
    });

    const row = page.locator("tr", { hasText: fixture.targetWallet });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.locator("select")).toHaveValue(initial);

    const save = row.getByRole("button", { name: /save role/i });
    await row.locator("select").selectOption(next);
    await expect(save).toBeEnabled();
    await save.click();
    // The button only goes quiet again once the write is reflected by a reload.
    await expect(save).toBeDisabled({ timeout: 20_000 });
    await expect(row.locator("select")).toHaveValue(next);
    await expect.poll(() => userRole(tokenFrom(ADMIN), fixture.targetId)).toBe(next);

    // Reset so the throwaway account is left as it was found.
    await row.locator("select").selectOption(initial);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    await expect
      .poll(() => userRole(tokenFrom(ADMIN), fixture.targetId))
      .toBe(initial);
  } finally {
    await context.close();
  }
});

test("self-demotion is refused and a non-admin is kept out of /workspace/admin", async ({
  browser,
}) => {
  const admin = tokenFrom(ADMIN);

  const selfDemote = await api(`/api/admin/users/${fixture.adminId}/role`, {
    token: admin,
    method: "PATCH",
    body: { role: "buyer" },
  });
  expect(selfDemote.status, selfDemote.text).toBe(400);

  const contributorPatch = await api(`/api/admin/users/${fixture.targetId}/role`, {
    token: tokenFrom(CONTRIBUTOR),
    method: "PATCH",
    body: { role: "reviewer" },
  });
  expect(contributorPatch.status, contributorPatch.text).toBe(403);

  const { context, page } = await openAs(browser, CONTRIBUTOR);
  try {
    await page.goto("/workspace/admin");
    await expect(page).toHaveURL(/\/workspace\/contributor$/, { timeout: 20_000 });
  } finally {
    await context.close();
  }
});
