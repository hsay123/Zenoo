/**
 * Throwable HTTP errors.
 *
 * Route handlers throw `HttpError`; `withErrorHandler` (lib/api/response.ts)
 * maps it to the standard error envelope. `AuthError` extends this class, so
 * auth failures flow through the same mapping.
 */

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT"
  | "INTERNAL_ERROR";

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static badRequest(message = "Bad request", details?: unknown): HttpError {
    return new HttpError("BAD_REQUEST", message, 400, details);
  }

  static unauthorized(message = "Unauthorized"): HttpError {
    return new HttpError("UNAUTHORIZED", message, 401);
  }

  static forbidden(message = "Forbidden"): HttpError {
    return new HttpError("FORBIDDEN", message, 403);
  }

  static notFound(message = "Not found"): HttpError {
    return new HttpError("NOT_FOUND", message, 404);
  }

  static conflict(message = "Conflict", details?: unknown): HttpError {
    return new HttpError("CONFLICT", message, 409, details);
  }

  static unprocessable(message = "Validation failed", details?: unknown): HttpError {
    return new HttpError("VALIDATION_ERROR", message, 422, details);
  }

  static rateLimit(message = "Too many requests"): HttpError {
    return new HttpError("RATE_LIMIT", message, 429);
  }

  static internal(message = "Internal server error"): HttpError {
    return new HttpError("INTERNAL_ERROR", message, 500);
  }
}
