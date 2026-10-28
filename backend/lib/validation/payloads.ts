/**
 * Annotation payload schemas (zod).
 *
 * These mirror the canonical JSON Schemas seeded in
 * `supabase/migrations/003_seed_schema_versions.sql`:
 *   - image-boxes-v1
 *   - action-segments-v1
 *
 * Structural ("shape") validation lives here and is intentionally lenient:
 * drafts may contain in-progress boxes (e.g. zero-size while dragging). All
 * *semantic* checks (bounds, overlaps, label membership, identity cross-checks)
 * live in `lib/annotation/validate.ts` and run at submit time.
 */

import { z } from "zod";

export const actionLabelSchema = z.enum([
  "reach",
  "grasp",
  "lift",
  "place",
  "inspect",
  "recover",
  "write",
  "other",
]);

export const segmentOutcomeSchema = z.enum([
  "success",
  "partial",
  "failure",
  "unknown",
]);

export const boundingBoxSchema = z.object({
  x: z.number({ invalid_type_error: "x must be a number" }),
  y: z.number({ invalid_type_error: "y must be a number" }),
  w: z.number({ invalid_type_error: "w must be a number" }),
  h: z.number({ invalid_type_error: "h must be a number" }),
  class: z.string().trim().min(1, "class is required"),
  confidence: z.number().int().min(1).max(5).optional(),
});

export const imageBoxesPayloadSchema = z.object({
  task_id: z.string().trim().min(1, "task_id is required"),
  asset_id: z.string().trim().min(1, "asset_id is required"),
  schema_version: z.literal("image-boxes-v1"),
  boxes: z.array(boundingBoxSchema),
  answers: z.record(z.string()).optional(),
});

export const actionSegmentSchema = z.object({
  start_ms: z.number().int().min(0, "start_ms must be >= 0"),
  end_ms: z.number().int().min(1, "end_ms must be >= 1"),
  action_label: actionLabelSchema,
  object: z.string().optional(),
  outcome: segmentOutcomeSchema,
  failure_reason: z.string().optional(),
  confidence: z.number().int().min(1).max(5),
});

export const actionSegmentsPayloadSchema = z.object({
  task_id: z.string().trim().min(1, "task_id is required"),
  asset_id: z.string().trim().min(1, "asset_id is required"),
  schema_version: z.literal("action-segments-v1"),
  segments: z.array(actionSegmentSchema),
});

/** Discriminated by `schema_version`; the single entry point for payloads. */
export const annotationPayloadSchema = z.discriminatedUnion("schema_version", [
  imageBoxesPayloadSchema,
  actionSegmentsPayloadSchema,
]);

export type ImageBoxesInput = z.infer<typeof imageBoxesPayloadSchema>;
export type ActionSegmentsInput = z.infer<typeof actionSegmentsPayloadSchema>;
export type AnnotationPayload = ImageBoxesInput | ActionSegmentsInput;
