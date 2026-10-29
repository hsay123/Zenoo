import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({
  createSignedMediaUrl: async (key: string, ttl: number) => `https://storage.test/${key}?ttl=${ttl}`,
}));

const { getAiReviewer, loadImageForReview, MAX_REVIEW_IMAGE_BYTES } = await import("../aiReviewer");
const { mockAiReviewer } = await import("../mockAiReviewer");
const { ClaudeAiReviewer } = await import("../claudeAiReviewer");
import type { Env } from "@/lib/env";

const env = (overrides: Partial<Env> = {}) =>
  ({
    ANTHROPIC_API_KEY: "sk-test",
    AI_REVIEWER: "auto",
    AI_REVIEW_MODEL: "claude-sonnet-5-5",
    AI_REVIEW_EFFORT: "medium",
    ...overrides,
  }) as Env;

const fakeClient = () => ({ messages: { parse: vi.fn() } }) as never;

describe("getAiReviewer", () => {
  it("keeps the mock when no API key is configured", () => {
    expect(getAiReviewer(env({ ANTHROPIC_API_KEY: undefined }), fakeClient)).toBe(mockAiReviewer);
    expect(getAiReviewer(env({ ANTHROPIC_API_KEY: "  " }), fakeClient)).toBe(mockAiReviewer);
  });

  it("keeps the mock when AI_REVIEWER=mock even with a key", () => {
    expect(getAiReviewer(env({ AI_REVIEWER: "mock" }), fakeClient)).toBe(mockAiReviewer);
  });

  it("uses Claude Sonnet 5.5 when a key is set", () => {
    const reviewer = getAiReviewer(env(), fakeClient);
    expect(reviewer).toBeInstanceOf(ClaudeAiReviewer);
    expect((reviewer as InstanceType<typeof ClaudeAiReviewer>).rubricVersion).toBe(
      "zeno-image-review-v1:claude-sonnet-5-5",
    );
  });
});

describe("loadImageForReview", () => {
  const respond = (body: Uint8Array, type: string, status = 200) =>
    (async () => new Response(body as unknown as BodyInit, { status, headers: { "content-type": type } })) as unknown as typeof fetch;

  it("downloads through a short-lived signed URL and base64-encodes the image", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    expect(await loadImageForReview("job/a.jpg", fetchImpl)).toEqual({
      data: Buffer.from([1, 2, 3]).toString("base64"),
      mediaType: "image/jpeg",
    });
    expect(seen[0]).toBe("https://storage.test/job/a.jpg?ttl=60");
  });

  it("refuses unsupported types, oversized images and failed downloads", async () => {
    await expect(loadImageForReview("k", respond(new Uint8Array([1]), "image/tiff"))).rejects.toThrow(/Unsupported/);
    await expect(
      loadImageForReview("k", respond(new Uint8Array(MAX_REVIEW_IMAGE_BYTES + 1), "image/png")),
    ).rejects.toThrow(/too large/);
    await expect(loadImageForReview("k", respond(new Uint8Array([1]), "image/png", 404))).rejects.toThrow(/404/);
  });
});
