/**
 * Request parsing helpers.
 */

import type { NextRequest } from "next/server";
import { HttpError } from "@/lib/api/errors";

/** Parse a JSON request body, throwing a 400 envelope error on malformed input. */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw HttpError.badRequest("Request body must be valid JSON");
  }
}
