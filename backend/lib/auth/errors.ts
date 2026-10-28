/**
 * Auth errors. Kept in their own module so both the response envelope
 * (`lib/api/response.ts`) and the auth helpers can import them without
 * creating a circular dependency.
 *
 * `AuthError` extends `HttpError` so route handlers can throw either and the
 * envelope mapper handles both uniformly.
 */

import { HttpError, type ErrorCode } from "@/lib/api/errors";

export type AuthErrorCode = Extract<ErrorCode, "UNAUTHORIZED" | "FORBIDDEN">;

export class AuthError extends HttpError {
  constructor(code: AuthErrorCode, message: string) {
    super(code, message, code === "UNAUTHORIZED" ? 401 : 403);
    this.name = "AuthError";
  }
}
