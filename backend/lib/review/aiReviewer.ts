/**
 * Which first-pass reviewer runs, and how it gets the image.
 *
 * The Claude reviewer is selected only when `ANTHROPIC_API_KEY` is set and
 * `AI_REVIEWER` is not "mock"; otherwise the MockAiReviewer stays in effect
 * and its results stay labelled `mock-v1`, exactly as before.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "@/lib/env";
import { createSignedMediaUrl } from "@/lib/storage";
import { ClaudeAiReviewer, type ReviewClient } from "@/lib/review/claudeAiReviewer";
import {
  mockAiReviewer,
  type AiReviewer,
  type ReviewImageMediaType,
} from "@/lib/review/mockAiReviewer";

/** Per-request ceiling for the model call; on timeout the task goes to a human. */
export const AI_REVIEW_TIMEOUT_MS = 45_000;

/** The API's per-image limit is 5 MB; larger images go to a human. */
export const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024;

const SUPPORTED_MEDIA_TYPES: readonly ReviewImageMediaType[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

let cached: { key: string; reviewer: AiReviewer } | null = null;

export function getAiReviewer(
  env: Env,
  makeClient: (apiKey: string) => ReviewClient = (apiKey) =>
    new Anthropic({ apiKey, timeout: AI_REVIEW_TIMEOUT_MS, maxRetries: 1 }),
): AiReviewer {
  const apiKey = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey || env.AI_REVIEWER === "mock") return mockAiReviewer;

  const key = `${env.AI_REVIEW_MODEL}:${env.AI_REVIEW_EFFORT}`;
  if (cached?.key !== key) {
    cached = {
      key,
      reviewer: new ClaudeAiReviewer(makeClient(apiKey), {
        model: env.AI_REVIEW_MODEL,
        effort: env.AI_REVIEW_EFFORT,
      }),
    };
  }
  return cached.reviewer;
}

/**
 * Download a private asset server-side (through a short-lived signed URL) and
 * return it base64-encoded for the model. The URL itself is never sent out.
 */
export async function loadImageForReview(
  objectKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ data: string; mediaType: ReviewImageMediaType }> {
  const url = await createSignedMediaUrl(objectKey, 60);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);

  const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!SUPPORTED_MEDIA_TYPES.includes(mediaType as ReviewImageMediaType)) {
    throw new Error(`Unsupported image type for review: ${mediaType || "unknown"}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_REVIEW_IMAGE_BYTES) {
    throw new Error(`Image too large for review: ${bytes.length} bytes`);
  }
  return { data: bytes.toString("base64"), mediaType: mediaType as ReviewImageMediaType };
}
