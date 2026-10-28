/**
 * Request validation schemas for the review workflow (zod).
 *
 * Body/schema failures surface as a 422 `VALIDATION_ERROR` via
 * `withErrorHandler` (ZodError mapping) or explicitly.
 */

import { z } from "zod";
import { modalitySchema } from "@/lib/validation/jobs";

export const reviewerTypeSchema = z.enum(["code", "ai", "human"]);
export const reviewDecisionValueSchema = z.enum(["accept", "revise", "reject"]);

/** Full runtime mirror of the `ReasonCode` union in `src/types/api.ts`. */
export const reasonCodeSchema = z.enum([
  "SCHEMA_INVALID",
  "BOX_OUT_OF_BOUNDS",
  "BOX_NEGATIVE_SIZE",
  "BOX_INVALID_CLASS",
  "SEGMENT_OUT_OF_BOUNDS",
  "SEGMENT_OVERLAP",
  "SEGMENT_ORDER",
  "SEGMENT_MISSING_FAILURE_REASON",
  "GOLD_FAIL",
  "DUPLICATE_PAYLOAD",
  "FAST_SUBMISSION_FLAG",
  "LOW_QUALITY",
  "MISSING_OBJECTS",
  "WRONG_CLASS",
  "IMPRECISE_TIMING",
  "INCONSISTENT_LABELS",
  "RUBRIC_VIOLATION",
  "APPEAL_UPHELD",
  "APPEAL_DISMISSED",
  "ACCEPTED",
]);

/** GET /api/review/queue query filters (pagination handled separately). */
export const listReviewQueueQuerySchema = z.object({
  modality: modalitySchema.optional(),
  reviewer_type: reviewerTypeSchema.optional(),
});

/** POST /api/reviews/{submissionId}/decision body. */
export const reviewDecisionSchema = z.object({
  decision: reviewDecisionValueSchema,
  reason_code: reasonCodeSchema,
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().max(2000).optional(),
  rubric_version: z.string().max(100).optional(),
});

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
