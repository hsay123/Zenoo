/**
 * S3b — Annotation workspace: real draw/move/resize, honest save, persistence,
 * submission, and reviewer visibility (real stack, nothing mocked).
 *
 * Built on a real buyer job over the API, exactly like S3/S4. Where S3 proves the
 * queue + draft + submit wiring, this suite drives the *editor* itself:
 *
 *   image task
 *     1. drag on the canvas to draw a bounding box
 *     2. drag the box body to move it, drag its corner to resize it
 *     3. a forced draft-save failure must surface as a failure and never as a
 *        false "Draft saved" confirmation
 *     4. a real save, then a full page reload, must show the persisted box
 *     5. submit -> version 1, and the task moves to `submitted` (checked over
 *        the API, not just the pixels)
 *
 *   video task
 *     6. playback metadata loads, the timeline seeks by click and keyboard
 *     7. Set start / Set end place the selected segment's boundaries
 *     8. the segment survives a reload and the video task submits
 *
 *   reviewer
 *     9. the reviewer's review console shows the submitted video segment and
 *        the correct job/task
 *
 * Prereqs: frontend https://localhost:3000 + backend :3010, and
 * playwright/.auth/{buyer,contributor,reviewer}.json captured fresh.
 * Run: npx playwright test e2e/s3b-annotation-workspace.spec.ts
 */
import { test, expect } from "playwright/test";
import fs from "node:fs";
import path from "node:path";
import { api, createPublishedJob, tokenFrom, type Fixture } from "./helpers/platform";

const BUYER = "./playwright/.auth/buyer.json";
const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const REVIEWER = "./playwright/.auth/reviewer.json";

const stamp = Date.now();
const image: Fixture = { projectId: "", jobId: "", title: "", assetIds: [], taskIds: [] };
const video: Fixture = { projectId: "", jobId: "", title: "", assetIds: [], taskIds: [] };

test.beforeAll(async () => {
  const buyer = tokenFrom(BUYER);
  const [imageFixture, videoFixture] = await Promise.all([
    createPublishedJob(buyer, {
      modality: "image",
      count: 1,
      title: `E2E S3b image job ${stamp}`,
    }),
    createPublishedJob(buyer, {
      modality: "video",
      count: 1,
      title: `E2E S3b video job ${stamp}`,
    }),
  ]);
  Object.assign(image, imageFixture);
  Object.assign(video, videoFixture);

  fs.writeFileSync(
    path.resolve("./playwright/.auth/s3b-fixture.json"),
    JSON.stringify({ image, video }, null, 2),
  );
});

test.describe("image annotation workspace", () => {
  test.use({ storageState: CONTRIBUTOR });

  test("draws, moves, resizes, survives a save failure, persists and submits", async ({
    page,
  }) => {
    const taskId = image.taskIds[0];
    const claim = await api(`/api/tasks/${taskId}/claim`, {
      token: tokenFrom(CONTRIBUTOR),
      method: "POST",
      headers: { "idempotency-key": `s3b-image-claim:${taskId}` },
    });
    expect(claim.status, claim.text).toBe(200);

    await page.goto(`/workspace/contributor/tasks/${taskId}`);
    await expect(page.getByRole("heading", { name: image.title })).toBeVisible({
      timeout: 20_000,
    });

    const canvas = page.locator("div.cursor-crosshair");
    const media = page.getByAltText("Task media");
    await expect(canvas).toBeVisible();
    await expect(media).toBeVisible();
    // Wait until the natural size is known: the canvas ignores drawing before it.
    await expect
      .poll(() => media.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    const rect = await canvas.boundingBox();
    expect(rect).not.toBeNull();
    if (!rect) return;

    // 1. Draw a box by dragging (real pointer events over the image).
    await page.mouse.move(rect.x + 40, rect.y + 40);
    await page.mouse.down();
    await page.mouse.move(rect.x + 120, rect.y + 100, { steps: 6 });
    await page.mouse.move(rect.x + 200, rect.y + 170, { steps: 6 });
    await page.mouse.up();

    await expect(page.locator("text=boxes[0]")).toBeVisible();
    await expect(page.getByText("Passes preview checks")).toBeVisible();

    const readBox = async () => ({
      x: Number(await page.getByLabel("x", { exact: true }).inputValue()),
      y: Number(await page.getByLabel("y", { exact: true }).inputValue()),
      w: Number(await page.getByLabel("w", { exact: true }).inputValue()),
      h: Number(await page.getByLabel("h", { exact: true }).inputValue()),
    });

    const drawn = await readBox();
    expect(drawn.w).toBeGreaterThan(0);
    expect(drawn.h).toBeGreaterThan(0);

    const natural = await media.evaluate((el: HTMLImageElement) => ({
      w: el.naturalWidth,
      h: el.naturalHeight,
    }));
    const toDisplay = (x: number, y: number) => ({
      x: rect.x + (x * rect.width) / natural.w,
      y: rect.y + (y * rect.height) / natural.h,
    });

    // 2a. Move the box from its centre.
    const centre = toDisplay(drawn.x + drawn.w / 2, drawn.y + drawn.h / 2);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 40, centre.y + 30, { steps: 6 });
    await page.mouse.up();
    const moved = await readBox();
    expect(moved.x).toBeGreaterThan(drawn.x);
    expect(moved.y).toBeGreaterThan(drawn.y);

    // 2b. Resize the box by dragging its bottom-right corner.
    const corner = toDisplay(moved.x + moved.w - 2, moved.y + moved.h - 2);
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x + 50, corner.y + 40, { steps: 6 });
    await page.mouse.up();
    const resized = await readBox();
    expect(resized.w).toBeGreaterThan(moved.w);
    expect(resized.h).toBeGreaterThan(moved.h);

    // 3. A failed save must never claim success.
    await page.route("**/api/tasks/*/draft", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "SERVER", message: "simulated platform outage" },
          }),
        });
      } else {
        await route.continue();
      }
    });
    const nudged = resized.w + 5;
    await page.getByLabel("w", { exact: true }).fill(String(nudged));
    await page.getByRole("button", { name: "Save draft" }).click();
    // Scoped: Next.js also renders an (empty) route-announcer with role="alert".
    await expect(
      page.getByRole("alert").filter({ hasText: "simulated platform outage" }),
    ).toBeVisible();
    await expect(page.getByText("Draft saved to the platform.")).toHaveCount(0);
    await page.unroute("**/api/tasks/*/draft");

    // 4. A real save, then a hard reload, must show the persisted value.
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved to the platform.")).toBeVisible({
      timeout: 20_000,
    });
    await page.reload();
    await expect(page.getByText(/Loaded from your draft/)).toBeVisible({ timeout: 20_000 });
    const persisted = await readBox();
    expect(persisted.w).toBe(nudged);
    expect(persisted.x).toBeGreaterThan(0);

    // 5. Submit, then confirm the persisted task status over the API.
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted — version 1")).toBeVisible({ timeout: 20_000 });

    const task = await api(`/api/tasks/${taskId}`, { token: tokenFrom(CONTRIBUTOR) });
    expect(task.status, task.text).toBe(200);
    expect((task.json.data as { status: string }).status).toBe("submitted");

    const payload = await api(`/api/tasks/${taskId}/draft`, { token: tokenFrom(CONTRIBUTOR) });
    expect(payload.status, payload.text).toBe(200);
    const work = payload.json.data as { payload: { boxes?: unknown[] } };
    expect(work.payload.boxes).toHaveLength(1);
  });
});

test.describe("video annotation workspace", () => {
  test.use({ storageState: CONTRIBUTOR });

  test("seeks the timeline, places segment boundaries, persists and submits", async ({
    page,
  }) => {
    const taskId = video.taskIds[0];
    const claim = await api(`/api/tasks/${taskId}/claim`, {
      token: tokenFrom(CONTRIBUTOR),
      method: "POST",
      headers: { "idempotency-key": `s3b-video-claim:${taskId}` },
    });
    expect(claim.status, claim.text).toBe(200);

    await page.goto(`/workspace/contributor/tasks/${taskId}`);
    await expect(page.getByRole("heading", { name: video.title })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("video")).toBeVisible();

    // 6. The timeline becomes usable once the video metadata (duration) loads.
    const slider = page.getByRole("slider", { name: "Video timeline" });
    await expect
      .poll(async () => Number(await slider.getAttribute("aria-valuemax")))
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "Add segment" }).click();
    await expect(page.locator("text=segments[0]")).toBeVisible();

    const track = await slider.boundingBox();
    expect(track).not.toBeNull();
    if (!track) return;

    // Seek by clicking the track, then by keyboard.
    await slider.click({ position: { x: track.width * 0.5, y: track.height / 2 } });
    await expect
      .poll(async () => Number(await slider.getAttribute("aria-valuenow")))
      .toBeGreaterThan(0);
    const before = Number(await slider.getAttribute("aria-valuenow"));
    await slider.press("ArrowRight");
    await expect
      .poll(async () => Number(await slider.getAttribute("aria-valuenow")))
      .toBeGreaterThan(before);

    // 7. Place the selected segment's boundaries from the current position.
    const startInput = page.getByLabel("Start (ms)", { exact: true });
    const endInput = page.getByLabel("End (ms)", { exact: true });
    await slider.click({ position: { x: 4, y: track.height / 2 } });
    await page.getByRole("button", { name: "Set start" }).click();
    await slider.click({ position: { x: track.width * 0.75, y: track.height / 2 } });
    await page.getByRole("button", { name: "Set end" }).click();
    await expect
      .poll(async () => Number(await endInput.inputValue()))
      .toBeGreaterThan(Number(await startInput.inputValue()));

    // 8. Save, reload, confirm the segment persisted.
    const savedStart = Number(await startInput.inputValue());
    const savedEnd = Number(await endInput.inputValue());
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved to the platform.")).toBeVisible({
      timeout: 20_000,
    });

    await page.reload();
    await expect(page.getByText(/Loaded from your draft/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("text=segments[0]")).toBeVisible();
    expect(Number(await page.getByLabel("Start (ms)", { exact: true }).inputValue())).toBe(
      savedStart,
    );
    expect(Number(await page.getByLabel("End (ms)", { exact: true }).inputValue())).toBe(savedEnd);

    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted — version 1")).toBeVisible({ timeout: 20_000 });

    const task = await api(`/api/tasks/${taskId}`, { token: tokenFrom(CONTRIBUTOR) });
    expect(task.status, task.text).toBe(200);
    expect((task.json.data as { status: string }).status).toBe("submitted");
  });
});

test.describe("reviewer sees the submitted annotation", () => {
  test.use({ storageState: REVIEWER });

  test("the review console shows the correct task and its submitted segment", async ({
    page,
  }) => {
    await page.goto("/workspace/reviewer");
    const row = page.locator("tr", { hasText: video.title });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("link", { name: "Review" }).click();

    await expect(page).toHaveURL(new RegExp(`/workspace/reviewer/review/${video.taskIds[0]}$`));
    await expect(page.getByRole("heading", { name: video.title })).toBeVisible();
    await expect(page.locator("video")).toBeVisible({ timeout: 30_000 });

    // The frozen submission payload is rendered, not just the media.
    await expect(page.getByRole("heading", { name: "Submitted annotation" })).toBeVisible();
    await expect(page.locator("text=segments[0]")).toBeVisible();
  });
});
