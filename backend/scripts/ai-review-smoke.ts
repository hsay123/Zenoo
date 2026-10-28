/**
 * Operator smoke test: run the real Claude first-pass reviewer on a local
 * image, without touching the database. Costs one model call per case.
 *
 * Usage (from backend/):
 *   npm run ai-review:smoke -- <image.png> '<boxes JSON>' '<labels JSON>'
 *   npm run ai-review:smoke -- ../e2e/fixtures/sample.png '[{"x":100,"y":100,"w":200,"h":150,"class":"car"}]' '["car","person"]'
 *
 * Prints the reviewer's decision, or the error that would send the task to a
 * human. Requires ANTHROPIC_API_KEY in .env.local.
 */

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { getEnv } from "../lib/env";
import { getAiReviewer } from "../lib/review/aiReviewer";
import type { ReviewImageMediaType } from "../lib/review/mockAiReviewer";
import type { BoundingBox } from "../src/types/api";

const TYPES: Record<string, ReviewImageMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function main() {
  const [imagePath, boxesJson = "[]", labelsJson = '["car","person"]'] = process.argv.slice(2);
  if (!imagePath) throw new Error("Usage: ai-review:smoke <image> '<boxes JSON>' '<labels JSON>'");
  const mediaType = TYPES[extname(imagePath).toLowerCase()];
  if (!mediaType) throw new Error(`Unsupported image type: ${imagePath}`);

  const reviewer = getAiReviewer(getEnv());
  if (reviewer.kind !== "model") {
    throw new Error("ANTHROPIC_API_KEY is not set (or AI_REVIEWER=mock): the mock reviewer is active");
  }

  const boxes = JSON.parse(boxesJson) as BoundingBox[];
  const started = Date.now();
  const result = await reviewer.review({
    modality: "image",
    payload: { task_id: "smoke", asset_id: "smoke", schema_version: "image-boxes-v1", boxes },
    labelList: JSON.parse(labelsJson) as string[],
    rubric: null,
    image: {
      width: null,
      height: null,
      load: async () => ({ data: readFileSync(imagePath).toString("base64"), mediaType }),
    },
  });
  console.log(JSON.stringify({ ...result, ms: Date.now() - started }, null, 2));
}

main().catch((error) => {
  console.error(`REVIEW FAILED (task would go to a human): ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
