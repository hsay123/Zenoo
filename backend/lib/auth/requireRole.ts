/**
 * Role guards for API routes.
 *
 *   const user = await requireRole(req, "buyer");
 *
 * Throws `AuthError`, which `withErrorHandler` maps to a 401/403 envelope.
 */

import type { NextRequest } from "next/server";
import { resolveUser, type AuthUser } from "@/lib/auth/verifyToken";
import { AuthError } from "@/lib/auth/errors";
import type { UserRole } from "@/src/types/api";

/** Require any authenticated, active user. */
export async function requireUser(req: NextRequest): Promise<AuthUser> {
  return resolveUser(req);
}

/** Require an authenticated, active user with one of the given roles. */
export async function requireRole(
  req: NextRequest,
  ...roles: UserRole[]
): Promise<AuthUser> {
  const user = await resolveUser(req);
  if (!roles.includes(user.role)) {
    throw new AuthError("FORBIDDEN", `Requires role: ${roles.join(" or ")}`);
  }
  return user;
}
