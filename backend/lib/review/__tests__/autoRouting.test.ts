/**
 * applyAutoRouting tests: reviewer selection, deferral, threshold routing and
 * the fail-safe (any AI failure leaves the task for a human).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiReviewer, AiReviewResult } from "../mockAiReviewer";

const state = {
  task: { id: "task-1", job_id: "job-1", asset_id: "asset-1", modality: "image", status: "submitted" },
  reviews: [] as Record<string, unknown>[],
  statusUpdates: [] as string[],
  profile: { gold_accuracy: 95, tasks_completed: 20 },
};

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ AI_CONFIDENCE_THRESHOLD: 0.75, ANTHROPIC_API_KEY: undefined, AI_REVIEWER: "auto" }),
}));
vi.mock("@/lib/review/repository", () => ({
  loadSubmission: async () => ({
    id: "sub-1",
    task_id: "task-1",
    contributor_id: "user-1",
    is_fast_flag: false,
    payload: { task_id: "task-1", asset_id: "asset-1", schema_version: "image-boxes-v1", boxes: [] },
  }),
  insertReview: async (r: Record<string, unknown>) => {
    state.reviews.push(r);
    return r;
  },
  listSubmittedQueue: async () => ({ items: [] }),
}));
vi.mock("@/lib/tasks/repository", () => ({
  loadTask: async () => ({ ...state.task }),
  toTask: (row: unknown) => row,
  updateTaskStatus: async () => undefined,
}));
vi.mock("@/lib/review/aiReviewer", () => ({
  AI_REVIEW_TIMEOUT_MS: 50,
  getAiReviewer: () => ({ kind: "mock", review: () => ({}) }),
  loadImageForReview: async () => ({ data: "aW1n", mediaType: "image/png" }),
}));
vi.mock("@/lib/db/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      const b = {
        select: () => b,
        update: (p: Record<string, unknown>) => {
          patch = p;
          return b;
        },
        eq: (col: string, v: unknown) => {
          filters[col] = v;
          return b;
        },
        maybeSingle: async () => {
          if (table === "contributor_profiles") return { data: state.profile, error: null };
          if (table === "jobs") return { data: { label_list: ["car"], rubric: null }, error: null };
          if (table === "assets") return { data: { object_key: "k", width: 640, height: 480 }, error: null };
          if (table === "tasks" && patch) {
            // Conditional update: only from the expected current status.
            if (filters.status !== undefined && filters.status !== state.task.status) {
              return { data: null, error: null };
            }
            state.task.status = String(patch.status);
            state.statusUpdates.push(String(patch.status));
            return { data: { id: "task-1" }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return b;
    },
  }),
}));

const { applyAutoRouting } = await import("../service");

const result = (overrides: Partial<AiReviewResult> = {}): AiReviewResult => ({
  decision: "accept",
  reason_code: "ACCEPTED",
  confidence: 0.9,
  notes: "ok",
  rubric_version: "zeno-image-review-v1:claude-sonnet-5-5",
  ...overrides,
});

function modelReviewer(answer: AiReviewResult | Error | "hang"): AiReviewer & { seenImage: boolean } {
  const r = {
    kind: "model" as const,
    seenImage: false,
    async review(input: Parameters<AiReviewer["review"]>[0]) {
      r.seenImage = Boolean(input.image && (await input.image.load()).data);
      if (answer === "hang") return new Promise<AiReviewResult>(() => {});
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return r;
}

/** Captures deferred work so the test can run it explicitly. */
function deferred() {
  const jobs: (() => Promise<void>)[] = [];
  return { defer: (w: () => Promise<void>) => void jobs.push(w), runAll: () => Promise.all(jobs.map((j) => j())), jobs };
}

beforeEach(() => {
  state.task.status = "submitted";
  state.task.modality = "image";
  state.reviews = [];
  state.statusUpdates = [];
  state.profile = { gold_accuracy: 95, tasks_completed: 20 };
});

describe("applyAutoRouting with the model reviewer", () => {
  it("defers the model call until after the response, then applies a confident decision", async () => {
    const d = deferred();
    const reviewer = modelReviewer(result());
    await applyAutoRouting("sub-1", { reviewer, defer: d.defer });

    expect(d.jobs).toHaveLength(1);
    expect(state.reviews).toHaveLength(0); // nothing yet: the submit returned first

    await d.runAll();
    expect(reviewer.seenImage).toBe(true);
    expect(state.reviews[0]).toMatchObject({ reviewerType: "ai", decision: "accept", confidence: 0.9 });
    expect(state.statusUpdates).toEqual(["accepted"]);
  });

  it("records a low-confidence suggestion but leaves the task for a human", async () => {
    const d = deferred();
    await applyAutoRouting("sub-1", { reviewer: modelReviewer(result({ confidence: 0.6 })), defer: d.defer });
    await d.runAll();
    expect(state.reviews).toHaveLength(1);
    expect(state.statusUpdates).toEqual([]);
    expect(state.task.status).toBe("submitted");
  });

  it("fails safe on an API error: no review, task stays submitted", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deferred();
    await applyAutoRouting("sub-1", { reviewer: modelReviewer(new Error("503")), defer: d.defer });
    await d.runAll();
    expect(state.reviews).toHaveLength(0);
    expect(state.task.status).toBe("submitted");
  });

  it("fails safe on a timeout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deferred();
    await applyAutoRouting("sub-1", { reviewer: modelReviewer("hang"), defer: d.defer });
    await d.runAll();
    expect(state.reviews).toHaveLength(0);
    expect(state.task.status).toBe("submitted");
  });

  it("never overrides a human who decided while the model was thinking", async () => {
    const d = deferred();
    await applyAutoRouting("sub-1", { reviewer: modelReviewer(result({ decision: "reject", reason_code: "LOW_QUALITY" })), defer: d.defer });
    state.task.status = "accepted"; // a human accepted it meanwhile
    await d.runAll();
    expect(state.statusUpdates).toEqual([]);
    expect(state.task.status).toBe("accepted");
  });

  it("does not call the model for video or risky submissions", async () => {
    const d = deferred();
    state.task.modality = "video";
    await applyAutoRouting("sub-1", { reviewer: modelReviewer(result()), defer: d.defer });
    state.task.modality = "image";
    state.profile = { gold_accuracy: 50, tasks_completed: 20 };
    await applyAutoRouting("sub-1", { reviewer: modelReviewer(result()), defer: d.defer });
    expect(d.jobs).toHaveLength(0);
    expect(state.reviews).toHaveLength(0);
  });
});

describe("applyAutoRouting with the mock reviewer", () => {
  it("still runs inline, as before", async () => {
    const mock: AiReviewer = { kind: "mock", review: () => result({ rubric_version: "mock-v1" }) };
    const d = deferred();
    await applyAutoRouting("sub-1", { reviewer: mock, defer: d.defer });
    expect(d.jobs).toHaveLength(0);
    expect(state.reviews[0]).toMatchObject({ rubricVersion: "mock-v1" });
    expect(state.statusUpdates).toEqual(["accepted"]);
  });
});
