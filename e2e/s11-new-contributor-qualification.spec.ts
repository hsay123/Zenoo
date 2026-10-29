/**
 * S11 — A brand-new contributor qualifies on gold tasks (real stack).
 *
 * New contributors (tier New) may only claim gold qualification tasks. This
 * proves a fresh sign-up finds the qualification job, opens the annotation
 * workspace on a real scene, boxes the cup and both blocks, submits, and the
 * automatic gold check scores it as a pass.
 *
 * Prereq: a funded qualification job with available gold tasks (created with
 * the admin API: POST /api/jobs/{id}/tasks { is_gold: true, gold_answer }).
 */
import { test, expect } from "playwright/test";
import { api } from "./helpers/platform";
import { freshAccount, installWallet, loginWithWallet } from "./helpers/wallet";

// Tall enough that the whole 4:3 canvas is on screen (pointer events need it).
test.use({ viewport: { width: 1280, height: 1400 } });

test("a fresh contributor claims a gold task, labels it and passes", async ({ page }) => {
  test.setTimeout(240_000);
  const account = freshAccount();
  await installWallet(page, account);
  await loginWithWallet(page);
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("privy:token") ?? "null"));
  const onboard = await api("/api/onboarding/complete", {
    token,
    method: "POST",
    body: { account_type: "contributor", wallet_address: account.address },
  });
  expect(onboard.status, onboard.text).toBe(200);

  // Paid jobs are shown as locked, with what unlocks them, not hidden.
  await page.goto("/workspace/contributor");
  await expect(page.getByRole("heading", { name: "Paid work waiting for you" })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText("Unlocks at Verified").first()).toBeVisible();
  await page.screenshot({ path: "test-results/s11-locked-work.png", fullPage: true });
  const locked = await api("/api/tasks/locked", { token });
  expect(locked.status, locked.text).toBe(200);
  expect((locked.json.data as { tier: string }).tier).toBe("new");

  // Only gold tasks are listed for a New contributor.
  const listed = await api("/api/tasks/available?page=1&per_page=100", { token });
  expect(listed.status, listed.text).toBe(200);
  const items = (listed.json.data as { items: Array<{ id: string; is_gold?: boolean; modality: string }> }).items;
  expect(items.length).toBeGreaterThan(0);
  const task = items.find((t) => t.modality === "image")!;
  const claim = await api(`/api/tasks/${task.id}/claim`, { token, method: "POST", headers: { "idempotency-key": `s11:${task.id}` } });
  expect(claim.status, claim.text).toBe(200);

  // The gold answer is never sent to the contributor.
  const detail = await api(`/api/tasks/${task.id}`, { token });
  expect(detail.text).not.toContain("gold_answer");

  await page.goto(`/workspace/contributor/tasks/${task.id}`);
  const media = page.getByAltText("Task media");
  await expect(media).toBeVisible({ timeout: 40_000 });
  await expect.poll(() => media.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(640);
  const canvas = page.locator("div.cursor-crosshair");
  const r = (await canvas.boundingBox())!;
  const sx = r.width / 640, sy = r.height / 480;

  // The three qualification scenes and their reference boxes (e2e/fixtures/qualification).
  const scenes: Record<string, Array<[string, number, number, number, number]>> = {
    a: [["cup", 90, 170, 110, 130], ["red_block", 330, 250, 90, 90], ["blue_block", 480, 140, 100, 100]],
    b: [["cup", 400, 180, 120, 140], ["red_block", 120, 300, 100, 80], ["blue_block", 250, 120, 80, 80]],
    c: [["cup", 260, 90, 100, 120], ["red_block", 80, 120, 90, 90], ["blue_block", 430, 290, 110, 90]],
  };
  // Identify the scene by the image bytes (the signed media URL is cross-origin).
  const src = (await media.getAttribute("src"))!;
  const bytes = Buffer.from(await (await fetch(src)).arrayBuffer());
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const files = { a: "qual-1.png", b: "qual-2.png", c: "qual-3.png" } as const;
  const fs = await import("node:fs");
  const dir = process.env.S11_SCENES_DIR ?? "e2e/fixtures/qualification";
  const sceneKey = (Object.keys(files) as Array<keyof typeof files>).find(
    (k) => createHash("sha256").update(fs.readFileSync(`${dir}/${files[k]}`)).digest("hex") === digest,
  )!;
  expect(sceneKey, "task image is one of the qualification scenes").toBeTruthy();

  for (const [n, [label, x, y, w, h]] of scenes[sceneKey].entries()) {
    await page.getByLabel("Draw label").selectOption(label);
    await expect(page.getByLabel("Draw label")).toHaveValue(label);
    // Choosing a label can scroll the page: measure the canvas again.
    const r = (await canvas.boundingBox())!;
    await page.mouse.move(r.x + x * sx + 1, r.y + y * sy + 1);
    await page.mouse.down();
    await page.mouse.move(r.x + (x + w) * sx - 1, r.y + (y + h) * sy - 1, { steps: 8 });
    await page.mouse.up();
    // Wait for this box to exist before drawing the next one.
    await expect(page.locator(`text=boxes[${n}]`)).toBeVisible();
  }
  await page.screenshot({ path: "test-results/s11-qualification-workspace.png", fullPage: true });

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted — version 1/)).toBeVisible({ timeout: 30_000 });
  const after = await api(`/api/tasks/${task.id}`, { token });
  expect((after.json.data as { status: string }).status).toBe("accepted"); // gold pass
});
