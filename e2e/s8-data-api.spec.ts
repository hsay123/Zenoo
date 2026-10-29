/**
 * S8 — Startup Data API (docs/api/README.md), real stack.
 *
 * `beforeAll` builds a funded image job over the real API, has a contributor
 * box two images (different classes) and a reviewer accept both, then mints an
 * API key for the buyer's organisation. The tests read those accepted labels
 * back through /api/v1 in every shape and check the guards.
 *
 * Prereqs: playwright/.auth/{buyer,contributor,reviewer}.json, and the buyer's
 * organisation holds the API plan (organizations.api_plan = 'api'), which a
 * Dodo test subscription sets; without it every /api/v1 call is 402.
 * Run: npx playwright test e2e/s8-data-api.spec.ts
 */
import { test, expect } from "playwright/test";
import { BACKEND, api, createPublishedJob, tokenFrom } from "./helpers/platform";

const BUYER = "./playwright/.auth/buyer.json";
const CONTRIBUTOR = "./playwright/.auth/contributor.json";
const REVIEWER = "./playwright/.auth/reviewer.json";

const fixture = { jobId: "", taskIds: [] as string[], assetIds: [] as string[], key: "", keyId: "" };
// The fixture image is 640x480; one box per image, different classes.
const BOXES = [
  { class: "cup", x: 64, y: 48, w: 128, h: 96 },
  { class: "hand", x: 320, y: 240, w: 160, h: 120 },
];

const v1 = async (path: string, key = fixture.key) => {
  const res = await fetch(`${BACKEND}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertions read arbitrary response shapes
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // streams are not JSON
  }
  return { status: res.status, json, text, type: res.headers.get("content-type") ?? "" };
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const buyer = tokenFrom(BUYER);
  const contributor = tokenFrom(CONTRIBUTOR);
  const reviewer = tokenFrom(REVIEWER);

  const created = await createPublishedJob(buyer, { modality: "image", count: 2, title: `E2E S8 data api ${Date.now()}` });
  Object.assign(fixture, { jobId: created.jobId, taskIds: created.taskIds, assetIds: created.assetIds });

  for (const [i, taskId] of created.taskIds.entries()) {
    const claim = await api(`/api/tasks/${taskId}/claim`, {
      token: contributor,
      method: "POST",
      headers: { "idempotency-key": `s8-claim:${taskId}` },
    });
    expect(claim.status, claim.text).toBe(200);
    const submit = await api(`/api/tasks/${taskId}/submit`, {
      token: contributor,
      method: "POST",
      headers: { "idempotency-key": `s8-submit:${taskId}` },
      body: { task_id: taskId, asset_id: created.assetIds[i], schema_version: "image-boxes-v1", boxes: [BOXES[i]] },
    });
    expect(submit.status, submit.text).toBe(201);
    const submissionId = (submit.json.data as { id: string }).id;
    // The AI first pass may already have accepted it; otherwise a human does.
    const accept = await api(`/api/reviews/${submissionId}/decision`, {
      token: reviewer,
      method: "POST",
      body: { decision: "accept", reason_code: "ACCEPTED" },
    });
    expect([200, 409], accept.text).toContain(accept.status);
  }

  const key = await api("/api/api-keys", { token: buyer, method: "POST", body: { name: `s8 ${Date.now()}` } });
  expect(key.status, key.text).toBe(201);
  const data = key.json.data as { id: string; key: string };
  fixture.key = data.key;
  fixture.keyId = data.id;
});

test.afterAll(async () => {
  if (fixture.keyId) await api(`/api/api-keys/${fixture.keyId}`, { token: tokenFrom(BUYER), method: "DELETE" });
});

test("lists the dataset with its accepted labels", async () => {
  const res = await v1("/api/v1/datasets");
  expect(res.status, res.text).toBe(200);
  const dataset = (res.json.data as Array<Record<string, unknown>>).find((d) => d.id === fixture.jobId);
  expect(dataset).toMatchObject({ modality: "image", schema_version: "image-boxes-v1", accepted_count: 2 });
});

test("returns accepted boxes in the zeno shape, with no contributor identity", async () => {
  const res = await v1(`/api/v1/datasets/${fixture.jobId}/labels`);
  expect(res.status, res.text).toBe(200);
  const records = res.json.data as Array<{ asset_id: string; boxes: unknown[]; width: number }>;
  expect(records).toHaveLength(2);
  const byAsset = new Map(records.map((r) => [r.asset_id, r]));
  expect(byAsset.get(fixture.assetIds[0])?.boxes).toEqual([BOXES[0]]);
  expect(byAsset.get(fixture.assetIds[1])?.boxes).toEqual([BOXES[1]]);
  expect(res.text).not.toMatch(/contributor_id|reviewer_id|email|wallet/);
});

test("writes YOLO lines normalised to the image size", async () => {
  const res = await v1(`/api/v1/datasets/${fixture.jobId}/labels?format=yolo`);
  expect(res.status, res.text).toBe(200);
  const classes = res.json.meta.classes as string[];
  const cup = (res.json.data as Array<{ asset_id: string; lines: string[] }>).find((r) => r.asset_id === fixture.assetIds[0]);
  // cup box 64,48 128x96 on 640x480 -> centre 0.2,0.2 size 0.2x0.2
  expect(cup?.lines).toEqual([`${classes.indexOf("cup")} 0.2 0.2 0.2 0.2`]);
});

test("writes COCO with classes filtered and renamed", async () => {
  const res = await v1(`/api/v1/datasets/${fixture.jobId}/labels?format=coco&classes=hand&rename=hand:gripper`);
  expect(res.status, res.text).toBe(200);
  expect(res.json.data.categories).toEqual([{ id: 1, name: "gripper" }]);
  expect(res.json.data.images).toHaveLength(1);
  expect(res.json.data.annotations[0]).toMatchObject({ image_id: fixture.assetIds[1], category_id: 1, bbox: [320, 240, 160, 120] });
});

test("pages with a cursor and links each image for 15 minutes", async () => {
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const res = await v1(`/api/v1/datasets/${fixture.jobId}/labels?limit=1&media=signed_url${cursor ? `&cursor=${cursor}` : ""}`);
    expect(res.status, res.text).toBe(200);
    const [record] = res.json.data as Array<{ asset_id: string; media_url: string }>;
    seen.push(record.asset_id);
    const media = await fetch(record.media_url);
    expect(media.status).toBe(200);
    cursor = res.json.next_cursor;
  } while (cursor);
  expect(seen.sort()).toEqual([...fixture.assetIds].sort());
});

test("streams every label as NDJSON and CSV", async () => {
  const jsonl = await v1(`/api/v1/datasets/${fixture.jobId}/labels/stream?split=train:0.5,val:0.5`);
  expect(jsonl.status).toBe(200);
  expect(jsonl.type).toContain("application/x-ndjson");
  const lines = jsonl.text.trim().split("\n").map((l) => JSON.parse(l));
  expect(lines).toHaveLength(2);
  for (const line of lines) expect(["train", "val"]).toContain(line.split);

  const csv = await v1(`/api/v1/datasets/${fixture.jobId}/labels/stream?format=csv&bbox=xyxy`);
  expect(csv.status).toBe(200);
  const rows = csv.text.trim().split("\n");
  expect(rows[0].startsWith("task_id,asset_id")).toBe(true);
  expect(rows).toHaveLength(3); // header + one row per box
});

test("guards: bad key, bad parameter, another dataset, revoked key", async () => {
  expect((await v1("/api/v1/datasets", `zeno_test_${"0".repeat(43)}`)).status).toBe(401);
  expect((await v1(`/api/v1/datasets/${fixture.jobId}/labels?bbox=polar`)).status).toBe(422);
  expect((await v1("/api/v1/datasets/00000000-0000-4000-8000-000000000000")).status).toBe(404);

  const revoke = await api(`/api/api-keys/${fixture.keyId}`, { token: tokenFrom(BUYER), method: "DELETE" });
  expect(revoke.status, revoke.text).toBe(200);
  expect((await v1("/api/v1/datasets")).status).toBe(401);
  fixture.keyId = "";
});
