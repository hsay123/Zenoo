/**
 * Query validation for the export endpoint.
 */

import { z } from "zod";

export const exportFormatSchema = z.enum(["json", "jsonl", "csv"]);

export type ExportFormatInput = z.infer<typeof exportFormatSchema>;
