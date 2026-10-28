/**
 * Standard API response envelope.
 *
 *   Success: { data: T }
 *   Failure: { error: { code: string; message: string; details?: unknown } }
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/api/errors";

export type ApiSuccess<T> = { data: T };
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data }, { status });
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data }, { status: 201 });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

// ---- Convenience helpers ----

export const unauthorized = (message = "Unauthorized") =>
  apiError("UNAUTHORIZED", message, 401);

export const forbidden = (message = "Forbidden") =>
  apiError("FORBIDDEN", message, 403);

export const notFound = (message = "Not found") =>
  apiError("NOT_FOUND", message, 404);

export const conflict = (message: string, details?: unknown) =>
  apiError("CONFLICT", message, 409, details);

export const unprocessable = (details: unknown) =>
  apiError("VALIDATION_ERROR", "Validation failed", 422, details);

export const tooManyRequests = (message = "Too many requests") =>
  apiError("RATE_LIMIT", message, 429);

export const internalError = (message = "Internal server error") =>
  apiError("INTERNAL_ERROR", message, 500);

/**
 * Wrap a route handler so unhandled errors return a consistent envelope.
 */
export function withErrorHandler<T>(
  handler: () => Promise<NextResponse<T>>,
): Promise<NextResponse<T | ApiError>> {
  return handler().catch((err: unknown) => {
    if (err instanceof HttpError) {
      return apiError(err.code, err.message, err.status, err.details) as NextResponse<ApiError>;
    }
    if (err instanceof ZodError) {
      return unprocessable(
        err.issues.map((i) => ({ path: i.path, message: i.message })),
      ) as NextResponse<ApiError>;
    }
    console.error("[API Error]", err);
    return internalError() as NextResponse<ApiError>;
  });
}
