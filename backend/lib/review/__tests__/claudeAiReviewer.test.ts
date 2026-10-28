/**
 * ClaudeAiReviewer tests — a fake SDK client, no network.
 *
 * The contract: a well-formed answer becomes an AiReviewResult; anything else
 * (refusal, truncation, unparseable or inconsistent output, API error) throws,
 * and the caller then leaves the task for a human.
 */

import { describe, expect, it } from "vitest";
import { ClaudeAiReviewer, CLAUDE_REVIEW_PROMPT_VERSION, type ReviewClient } from "../claudeAiReviewer";
import type { AiReviewInput } from "../mockAiReviewer";

type Parsed = { decision: string; reason_code: string; confidence: number; notes: string } | null;

function client(result: { parsed_output: Parsed; stop_reason?: string } | Error) {
  const calls: Record<string, unknown>[] = [];
  const c = {
    messages: {
      parse: async (params: Record<string, unknown>) => {
        calls.push(params);
        if (result instanceof Error) throw result;
        return { stop_reason: "end_turn", ...result };
      },
    },
  } as unknown as ReviewClient;
  return { c, calls };
}

const input = (overrides: Partial<AiReviewInput> = {}): AiReviewInput => ({
  modality: "image",
  payload: {
    task_id: "t",
    asset_id: "a",
    schema_version: "image-boxes-v1",
    boxes: [{ x: 10, y: 20, w: 30, h: 40, class: "car", confidence: 4 }],
  },
  labelList: ["car", "person"],
  rubric: { tight_boxes: true },
  image: {
    width: 640,
    height: 480,
    load: async () => ({ data: "aW1n", mediaType: "image/png" }),
  },
  ...overrides,
});

const OPTS = { model: "claude-sonnet-5-5", effort: "medium" as const };
const good = { decision: "accept", reason_code: "ACCEPTED", confidence: 0.91234, notes: " Boxes match. " };

describe("ClaudeAiReviewer", () => {
  it("returns the existing AiReviewResult shape from a valid answer", async () => {
    const { c } = client({ parsed_output: good });
    const result = await new ClaudeAiReviewer(c, OPTS).review(input());
    expect(result).toEqual({
      decision: "accept",
      reason_code: "ACCEPTED",
      confidence: 0.912,
      notes: "Boxes match.",
      rubric_version: `${CLAUDE_REVIEW_PROMPT_VERSION}:claude-sonnet-5-5`,
    });
  });

  it("sends the image, labels, rubric and boxes with structured output and the chosen effort", async () => {
    const { c, calls } = client({ parsed_output: good });
    await new ClaudeAiReviewer(c, OPTS).review(input());
    const params = calls[0] as {
      model: string;
      output_config: { effort: string; format: unknown };
      messages: { content: { type: string; source?: unknown; text?: string }[] }[];
    };
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.output_config.effort).toBe("medium");
    expect(params.output_config.format).toBeTruthy();
    const [image, text] = params.messages[0].content;
    expect(image).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "aW1n" } });
    expect(text.text).toContain("640 x 480 pixels");
    expect(text.text).toContain('["car","person"]');
    expect(text.text).toContain('"tight_boxes":true');
    expect(text.text).toContain('"label":"car"');
  });

  it("throws on a refusal", async () => {
    const { c } = client({ parsed_output: null, stop_reason: "refusal" });
    await expect(new ClaudeAiReviewer(c, OPTS).review(input())).rejects.toThrow(/declined/);
  });

  it("throws on a truncated answer", async () => {
    const { c } = client({ parsed_output: good, stop_reason: "max_tokens" });
    await expect(new ClaudeAiReviewer(c, OPTS).review(input())).rejects.toThrow(/cut off/);
  });

  it("throws when no structured output was parsed", async () => {
    const { c } = client({ parsed_output: null });
    await expect(new ClaudeAiReviewer(c, OPTS).review(input())).rejects.toThrow(/valid review/);
  });

  it("throws on an inconsistent decision and reason code", async () => {
    const accepted = client({ parsed_output: { ...good, decision: "reject" } });
    await expect(new ClaudeAiReviewer(accepted.c, OPTS).review(input())).rejects.toThrow(/Inconsistent/);
    const revised = client({ parsed_output: { ...good, reason_code: "WRONG_CLASS" } });
    await expect(new ClaudeAiReviewer(revised.c, OPTS).review(input())).rejects.toThrow(/Inconsistent/);
  });

  it("throws on a confidence outside 0-1", async () => {
    const { c } = client({ parsed_output: { ...good, confidence: 1.5 } });
    await expect(new ClaudeAiReviewer(c, OPTS).review(input())).rejects.toThrow(/out of range/);
  });

  it("propagates API errors (the caller routes to a human)", async () => {
    const { c } = client(new Error("503 overloaded"));
    await expect(new ClaudeAiReviewer(c, OPTS).review(input())).rejects.toThrow(/503/);
  });

  it("never reviews video, and refuses without an image", async () => {
    const { c, calls } = client({ parsed_output: good });
    const reviewer = new ClaudeAiReviewer(c, OPTS);
    await expect(reviewer.review(input({ modality: "video" }))).rejects.toThrow(/only reviews images/);
    await expect(reviewer.review(input({ image: undefined }))).rejects.toThrow(/No image/);
    expect(calls).toHaveLength(0);
  });
});
