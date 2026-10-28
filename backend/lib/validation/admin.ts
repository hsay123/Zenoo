/**
 * Request validation schemas for admin-only endpoints (zod).
 */

import { z } from "zod";

export const userRoleSchema = z.enum(["buyer", "contributor", "reviewer", "admin"]);

/** PATCH /api/admin/users/{id}/role */
export const setRoleSchema = z.object({
  role: userRoleSchema,
});

export const listUsersQuerySchema = z.object({
  role: userRoleSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type SetRoleInput = z.infer<typeof setRoleSchema>;
