/**
 * Request validation for the settlement flow.
 */

import { z } from "zod";

export const settlementAcceptSchema = z.object({
  task_id: z.string().uuid("task_id must be a UUID"),
  submission_id: z.string().uuid("submission_id must be a UUID"),
});

export type SettlementAcceptInput = z.infer<typeof settlementAcceptSchema>;