/**
 * Request validation schemas for jobs and tasks (zod).
 *
 * Body schemas throw `ZodError`, which `withErrorHandler` maps to a 422
 * `VALIDATION_ERROR` envelope with field-level details.
 */

import { z } from "zod";

export const modalitySchema = z.enum(["image", "video"]);
export const jobStatusSchema = z.enum(["draft", "published", "paused", "closed"]);

/**
 * Canonical on-chain amount unit for the testnet MVP: **native testnet MON**.
 *
 * Budget and reward feed `parseEther()` at the chain boundary, so they must be
 * exact decimals — never JS floats. We accept a number *or* string for
 * backwards compatibility, normalise to a string, and enforce the
 * `NUMERIC(18,6)` storage shape: at most 12 integer digits and 6 decimals, and
 * strictly positive.
 *
 * There is no USD field on the job: the stored number *is* the MON payout. A
 * separate business-pricing field and an explicit conversion would be required
 * before any USD-denominated reward can be used for settlement.
 */
const MON_AMOUNT_RE = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const ZERO_AMOUNT_RE = /^0(?:\.0+)?$/;

export function normaliseMonAmount(value: unknown): string | null {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!MON_AMOUNT_RE.test(trimmed)) return null;
  if (ZERO_AMOUNT_RE.test(trimmed)) return null;
  return trimmed;
}

export const monAmountSchema = z
  .union([z.string(), z.number()], {
    invalid_type_error: "amount must be a decimal string or number",
  })
  .superRefine((value, ctx) => {
    if (normaliseMonAmount(value) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "must be a positive amount in testnet MON with at most 6 decimal places",
      });
    }
  })
  .transform((value) => normaliseMonAmount(value) as string);

/** POST /api/jobs */
export const createJobSchema = z.object({
  project_id: z.string().uuid("project_id must be a UUID"),
  title: z.string().trim().min(1, "title is required").max(200),
  description: z.string().max(5000).optional(),
  modality: modalitySchema,
  reward_per_task: monAmountSchema,
  budget: monAmountSchema,
  deadline: z
    .string()
    .datetime({ offset: true, message: "deadline must be an ISO 8601 timestamp" })
    .optional(),
  rubric: z.record(z.unknown()).optional(),
  label_list: z
    .array(z.string().trim().min(1))
    .min(1, "label_list must contain at least one label"),
  schema_version_id: z.string().uuid("schema_version_id must be a UUID").optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

/** GET /api/jobs query filters (pagination handled separately). */
export const listJobsQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  modality: modalitySchema.optional(),
});

/** GET /api/tasks/available query filters (pagination handled separately). */
export const listAvailableTasksQuerySchema = z.object({
  job_id: z.string().uuid("job_id must be a UUID").optional(),
  modality: modalitySchema.optional(),
});

/** Parse a URLSearchParams object (first value wins) into a plain record. */
export function searchParamsToRecord(
  searchParams: URLSearchParams,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (record[key] === undefined) record[key] = value;
  }
  return record;
}
