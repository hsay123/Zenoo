/**
 * toJob money fields: every amount leaves the API as a decimal string, even
 * when PostgREST hands NUMERIC back as a JSON number.
 */

import { describe, expect, it } from "vitest";
import { toJob, type JobRow } from "../repository";

const row = {
  id: "j1",
  project_id: "p1",
  title: "t",
  modality: "image",
  reward_per_task: 0.04,
  budget: 100,
  status: "published",
  label_list: ["cup"],
  created_at: "2026-10-29T00:00:00Z",
  updated_at: "2026-10-29T00:00:00Z",
  funding_status: "unfunded",
} as unknown as JobRow;

describe("toJob", () => {
  it("returns funded_amount as a decimal string when the row holds a number", () => {
    expect(toJob({ ...row, funded_amount: 0 } as JobRow).funded_amount).toBe("0");
    expect(toJob({ ...row, funded_amount: 12.5 } as JobRow).funded_amount).toBe("12.5");
  });

  it("keeps a string funded_amount and a missing one as null", () => {
    expect(toJob({ ...row, funded_amount: "3.000000" } as JobRow).funded_amount).toBe("3.000000");
    expect(toJob({ ...row, funded_amount: null } as JobRow).funded_amount).toBeNull();
  });

  it("returns reward and budget as strings", () => {
    const job = toJob(row);
    expect(job.reward_per_task).toBe("0.04");
    expect(job.budget).toBe("100");
  });
});
