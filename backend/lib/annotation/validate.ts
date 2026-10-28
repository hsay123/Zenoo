/**
 * Semantic (post-schema) annotation validation.
 *
 * Produces field-level `ValidationIssue`s carrying the PRD `ReasonCode`s that
 * the API returns in a 422 `VALIDATION_ERROR` envelope. Runs at submit time;
 * drafts skip semantic checks so a contributor can autosave work in progress.
 *
 * `parseAnnotationPayload` folds structural (zod) failures into the same
 * issue shape with `SCHEMA_INVALID`.
 */

import type { ZodError } from "zod";
import { HttpError } from "@/lib/api/errors";
import {
  annotationPayloadSchema,
  type ActionSegmentsInput,
  type AnnotationPayload,
  type ImageBoxesInput,
} from "@/lib/validation/payloads";
import type { Modality, ReasonCode } from "@/src/types/api";

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
  code: ReasonCode;
}

export interface ValidationContext {
  taskId: string;
  assetId: string;
  modality: Modality;
  labelList: string[];
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** Map zod issues to `SCHEMA_INVALID` validation issues. */
export function schemaIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [...issue.path] as (string | number)[],
    message: issue.message,
    code: "SCHEMA_INVALID" as ReasonCode,
  }));
}

/**
 * Parse an unknown body into an `AnnotationPayload`, throwing a 422
 * `VALIDATION_ERROR` (with `SCHEMA_INVALID` issues) on structural failure.
 */
export function parseAnnotationPayload(input: unknown): AnnotationPayload {
  const parsed = annotationPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw HttpError.unprocessable("Validation failed", schemaIssues(parsed.error));
  }
  return parsed.data;
}

function identityIssues(
  payload: { task_id: string; asset_id: string },
  ctx: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (payload.task_id !== ctx.taskId) {
    issues.push({
      path: ["task_id"],
      message: "task_id does not match the task being annotated",
      code: "SCHEMA_INVALID",
    });
  }
  if (payload.asset_id !== ctx.assetId) {
    issues.push({
      path: ["asset_id"],
      message: "asset_id does not match the task's asset",
      code: "SCHEMA_INVALID",
    });
  }
  return issues;
}

export function validateImageBoxes(
  payload: ImageBoxesInput,
  ctx: ValidationContext,
): ValidationIssue[] {
  const issues = identityIssues(payload, ctx);
  const labels = new Set(ctx.labelList);

  payload.boxes.forEach((box, i) => {
    const base = ["boxes", i];

    if (box.w <= 0 || box.h <= 0) {
      issues.push({
        path: [...base, box.w <= 0 ? "w" : "h"],
        message: "box width and height must be positive",
        code: "BOX_NEGATIVE_SIZE",
      });
    }

    const outOfBounds =
      box.x < 0 ||
      box.y < 0 ||
      (ctx.width != null && box.x + box.w > ctx.width) ||
      (ctx.height != null && box.y + box.h > ctx.height);
    if (outOfBounds) {
      issues.push({
        path: base,
        message: "box exceeds image bounds",
        code: "BOX_OUT_OF_BOUNDS",
      });
    }

    if (!labels.has(box.class)) {
      issues.push({
        path: [...base, "class"],
        message: `class '${box.class}' is not in the job label list`,
        code: "BOX_INVALID_CLASS",
      });
    }
  });

  return issues;
}

export function validateVideoSegments(
  payload: ActionSegmentsInput,
  ctx: ValidationContext,
): ValidationIssue[] {
  const issues = identityIssues(payload, ctx);
  const segments = payload.segments;

  segments.forEach((segment, i) => {
    const base = ["segments", i];

    if (segment.end_ms <= segment.start_ms) {
      issues.push({
        path: base,
        message: "end_ms must be greater than start_ms",
        code: "SCHEMA_INVALID",
      });
    }

    if (ctx.durationMs != null && segment.end_ms > ctx.durationMs) {
      issues.push({
        path: [...base, "end_ms"],
        message: `segment exceeds clip duration (${ctx.durationMs}ms)`,
        code: "SEGMENT_OUT_OF_BOUNDS",
      });
    }

    if (segment.outcome === "failure" && !segment.failure_reason?.trim()) {
      issues.push({
        path: [...base, "failure_reason"],
        message: "'failure_reason' is required when outcome is 'failure'",
        code: "SEGMENT_MISSING_FAILURE_REASON",
      });
    }
  });

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const cur = segments[i];
    if (cur.start_ms < prev.start_ms) {
      issues.push({
        path: ["segments", i],
        message: "segments must be ordered by ascending start_ms",
        code: "SEGMENT_ORDER",
      });
    }
    if (cur.start_ms < prev.end_ms) {
      issues.push({
        path: ["segments", i],
        message: "segments must not overlap",
        code: "SEGMENT_OVERLAP",
      });
    }
  }

  return issues;
}

/** Dispatch semantic validation by payload schema. */
export function validateAnnotation(
  payload: AnnotationPayload,
  ctx: ValidationContext,
): ValidationIssue[] {
  if (payload.schema_version === "image-boxes-v1") {
    return validateImageBoxes(payload, ctx);
  }
  return validateVideoSegments(payload, ctx);
}
