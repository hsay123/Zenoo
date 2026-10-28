/**
 * Request validation schemas for the buyer content pipeline:
 * projects, asset upload/registration, and task creation.
 *
 * Body schemas throw `ZodError`, mapped to a 422 `VALIDATION_ERROR` envelope.
 */

import { z } from "zod";
import { modalitySchema } from "@/lib/validation/jobs";

export { modalitySchema };

/** POST /api/projects */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  data_rights: z.string().trim().max(5000).optional(),
  retention_policy: z.string().trim().max(2000).optional(),
});

/** GET /api/projects */
export const listProjectsQuerySchema = z.object({
  page: z.string().optional(),
  per_page: z.string().optional(),
});

/** POST /api/assets/upload-url */
export const uploadUrlSchema = z.object({
  project_id: z.string().uuid("project_id must be a UUID"),
  modality: modalitySchema,
  filename: z.string().trim().min(1, "filename is required").max(300),
  content_type: z.string().trim().min(1).max(200).optional(),
});

/** POST /api/assets */
export const createAssetSchema = z
  .object({
    project_id: z.string().uuid("project_id must be a UUID"),
    modality: modalitySchema,
    object_key: z.string().trim().min(1, "object_key is required").max(1024),
    content_hash: z.string().trim().min(8, "content_hash is required").max(200),
    size_bytes: z.number().int().positive().optional(),
    duration_ms: z.number().int().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    consent_ref: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.modality === "video" && value.duration_ms == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duration_ms"],
        message: "duration_ms is required for a video asset",
      });
    }
    if (value.modality === "image") {
      if (value.width == null || value.height == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["width"],
          message: "width and height are required for an image asset",
        });
      }
    }
  });

/** POST /api/jobs/{id}/tasks */
export const createTasksSchema = z.object({
  asset_ids: z.array(z.string().uuid("asset_ids entries must be UUIDs")).min(1).max(500),
  is_gold: z.boolean().optional().default(false),
  gold_answer: z.record(z.unknown()).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type CreateTasksInput = z.infer<typeof createTasksSchema>;
