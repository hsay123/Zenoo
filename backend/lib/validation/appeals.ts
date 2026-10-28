/**
 * Request validation schemas for the appeals workflow (zod).
 */

import { z } from "zod";

/** POST /api/submissions/{id}/appeal body. */
export const appealRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "reason must be at least 10 characters")
    .max(2000, "reason must be at most 2000 characters"),
});

export const appealDecisionValueSchema = z.enum(["accept", "reject"]);

export const appealReasonCodeSchema = z.enum([
  "APPEAL_UPHELD",
  "APPEAL_DISMISSED",
]);

/** POST /api/appeals/{id}/decision body. */
export const appealDecisionSchema = z.object({
  decision: appealDecisionValueSchema,
  reason_code: appealReasonCodeSchema,
  notes: z.string().trim().max(2000).optional(),
});

export type AppealRequestInput = z.infer<typeof appealRequestSchema>;
export type AppealDecisionInput = z.infer<typeof appealDecisionSchema>;
