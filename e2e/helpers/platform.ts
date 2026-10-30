/**
 * E2E platform helpers.
 *
 * These talk to the real backend with a real Privy session token pulled from a
 * captured storage state. Fixtures are built through the same public API the
 * product uses (project -> signed upload -> asset -> job -> tasks -> publish);
 * nothing is written to the database directly and no response is mocked.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect } from "playwright/test";
import { fundJob } from "./funding";

export const BACKEND = process.env.E2E_BACKEND ?? "http://localhost:3010";

export const SCHEMA = {
  image: {
    id: "a0000000-0000-0000-0000-000000000001",
    name: "image-boxes-v1",
    labels: ["cup", "red_block", "blue_block", "hand", "robot_arm", "other"],
  },
  video: {
    id: "a0000000-0000-0000-0000-000000000002",
    name: "action-segments-v1",
    labels: ["reach", "grasp", "lift", "place", "inspect", "recover", "write", "other"],
  },
} as const;

export type Modality = keyof typeof SCHEMA;

/** Read `privy:token` out of a Playwright storage-state file. */
export function tokenFrom(statePath: string): string {
  const state = JSON.parse(fs.readFileSync(path.resolve(statePath), "utf8"));
  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (item.name === "privy:token") return JSON.parse(item.value);
    }
  }
  throw new Error(`no privy:token in ${statePath}`);
}

export type ApiResult = {
  status: number;
  json: { data?: unknown } & Record<string, unknown>;
  text: string;
};

/** Call the backend directly (no browser, no CORS) with an optional bearer. */
export async function api(
  route: string,
  opts: {
    token?: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResult> {
  const res = await fetch(`${BACKEND}${route}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: ApiResult["json"] = {};
  try {
    json = JSON.parse(text) as ApiResult["json"];
  } catch {
    /* non-JSON response (e.g. a stream) */
  }
  return { status: res.status, json, text };
}

export interface Fixture {
  projectId: string;
  jobId: string;
  title: string;
  assetIds: string[];
  taskIds: string[];
}

function fixtureBytesPath(modality: Modality): string {
  return path.resolve(
    modality === "video" ? "./e2e/fixtures/sample.mp4" : "./e2e/fixtures/sample.png",
  );
}

/**
 * Build a published job with `count` tasks over freshly uploaded assets, all
 * through the real buyer API. Returns the ids the specs need.
 */
export async function createPublishedJob(
  buyerToken: string,
  opts: {
    modality: Modality;
    count: number;
    title: string;
    reward?: number;
    budget?: number;
    /** Fund the escrow on Base Sepolia after publishing (default true). */
    fund?: boolean;
  },
): Promise<Fixture> {
  const bytes = fs.readFileSync(fixtureBytesPath(opts.modality));
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const contentType = opts.modality === "video" ? "video/mp4" : "image/png";

  const project = await api("/api/projects", {
    token: buyerToken,
    method: "POST",
    body: {
      name: `E2E ${opts.title}`,
      data_rights: "E2E-owned capture; cleared for annotation.",
      retention_policy: "Deleted with the project.",
    },
  });
  expect(project.status, project.text).toBe(201);
  const projectId = (project.json.data as { id: string }).id;

  const assetIds: string[] = [];
  for (let i = 0; i < opts.count; i += 1) {
    const up = await api("/api/assets/upload-url", {
      token: buyerToken,
      method: "POST",
      body: {
        project_id: projectId,
        filename: `${opts.title.replace(/\W+/g, "-")}-${i}-${Date.now()}.${
          opts.modality === "video" ? "mp4" : "png"
        }`,
        modality: opts.modality,
      },
    });
    expect(up.status, up.text).toBe(201);
    const { upload_url, object_key } = up.json.data as {
      upload_url: string;
      object_key: string;
    };

    const put = await fetch(upload_url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: bytes,
    });
    expect(put.ok, `upload PUT ${put.status}`).toBe(true);

    const asset = await api("/api/assets", {
      token: buyerToken,
      method: "POST",
      body: {
        project_id: projectId,
        object_key,
        modality: opts.modality,
        content_hash: contentHash,
        ...(opts.modality === "video"
          ? { duration_ms: 1000 }
          : { width: 640, height: 480 }),
      },
    });
    expect(asset.status, asset.text).toBe(201);
    assetIds.push((asset.json.data as { id: string }).id);
  }

  const job = await api("/api/jobs", {
    token: buyerToken,
    method: "POST",
    body: {
      project_id: projectId,
      title: opts.title,
      modality: opts.modality,
      // Small amounts: fixture jobs are funded with real test USDC.
      reward_per_task: opts.reward ?? 0.04,
      budget: opts.budget ?? Number((0.04 * opts.count).toFixed(6)),
      label_list: SCHEMA[opts.modality].labels,
      schema_version_id: SCHEMA[opts.modality].id,
      // Automated fixtures must never appear in a real contributor's queue.
      // Production hides `is_test` jobs; development still shows them so the
      // e2e suite exercises the same claim/review flow.
      is_test: true,
    },
  });
  expect(job.status, job.text).toBe(201);
  const jobId = (job.json.data as { id: string }).id;

  const tasks = await api(`/api/jobs/${jobId}/tasks`, {
    token: buyerToken,
    method: "POST",
    body: { asset_ids: assetIds },
  });
  expect(tasks.status, tasks.text).toBe(201);
  const taskIds = (tasks.json.data as { id: string }[]).map((task) => task.id);

  const publish = await api(`/api/jobs/${jobId}/publish`, {
    token: buyerToken,
    method: "POST",
  });
  expect(publish.status, publish.text).toBe(200);

  // Only a funded job's tasks are listed and claimable (HHG F2).
  if (opts.fund !== false) await fundJob(buyerToken, jobId);

  return { projectId, jobId, title: opts.title, assetIds, taskIds };
}
