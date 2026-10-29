/**
 * Authentication: resolve the caller of a request to a row in `users`.
 *
 * Two modes:
 *   - DEV (`DEV_AUTH_BYPASS=true`, refused in production): the caller is
 *     identified by the `x-dev-user-id` header, which must be a UUID that
 *     matches an existing user row. (ASSUMPTIONS A5/A6)
 *   - Production: a Privy access token is verified and the user is looked up
 *     (and created on first login, ASSUMPTIONS A4) by Privy DID.
 *
 * Verification mirrors `@privy-io/server-auth`'s `verifyAuthToken`: ES256
 * signature, `iss = "privy.io"`, `aud = PRIVY_APP_ID`, and expiry. The
 * verification key is either `PRIVY_VERIFICATION_KEY` (SPKI PEM, no network)
 * or fetched from the Privy API with the app secret. After the DID is
 * obtained we best-effort fetch the linked email/wallet via the server SDK;
 * if that call fails we fall back to the DID only.
 */

import type { NextRequest } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";
import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";
import { AuthError } from "@/lib/auth/errors";
import type { UserRole, UserStatus } from "@/src/types/api";

export interface AuthUser {
  id: string;
  privy_did: string | null;
  wallet_address: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  onboarding_completed: boolean;
  onboarding_account_type: "buyer" | "contributor" | null;
  organization_id: string | null;
}

export interface PrivyClaims {
  privyDid: string;
  walletAddress?: string | null;
  email?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate the `x-dev-user-id` header value. */
export function parseDevUserId(raw: string | null): string {
  const id = raw?.trim();
  if (!id) {
    throw new AuthError(
      "UNAUTHORIZED",
      "Missing x-dev-user-id header (DEV_AUTH_BYPASS is enabled)",
    );
  }
  if (!UUID_RE.test(id)) {
    throw new AuthError("UNAUTHORIZED", "x-dev-user-id is not a valid UUID");
  }
  return id;
}

/** Extract the bearer token from an Authorization header value. */
export function parseBearerToken(raw: string | null): string {
  if (!raw) {
    throw new AuthError("UNAUTHORIZED", "Missing Authorization header");
  }
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) {
    throw new AuthError(
      "UNAUTHORIZED",
      "Authorization header must be 'Bearer <token>'",
    );
  }
  return match[1].trim();
}

/** Resolve the authenticated user for a request. */
export async function resolveUser(req: NextRequest): Promise<AuthUser> {
  const env = getEnv();

  if (env.DEV_AUTH_BYPASS === "true") {
    const id = parseDevUserId(req.headers.get("x-dev-user-id"));
    return loadUserById(id);
  }

  const token = parseBearerToken(req.headers.get("authorization"));
  // Profile (email, wallet) is fetched from Privy only when a new user is
  // created: for existing users it was a wasted API round-trip per request.
  const claims = await verifyPrivyToken(
    token,
    env.PRIVY_APP_ID ?? "",
    env.PRIVY_APP_SECRET ?? "",
    env.PRIVY_VERIFICATION_KEY,
    { includeProfile: false },
  );
  return loadOrCreateUserByPrivyDid(claims, () =>
    fetchPrivyProfile(env.PRIVY_APP_ID ?? "", env.PRIVY_APP_SECRET ?? "", claims.privyDid),
  );
}

async function loadUserById(id: string): Promise<AuthUser> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load user: ${error.message}`);
  if (!data) throw new AuthError("UNAUTHORIZED", "User not found");
  if (data.status === "suspended") {
    throw new AuthError("FORBIDDEN", "User is suspended");
  }
  return data as AuthUser;
}

export async function loadOrCreateUserByPrivyDid(
  claims: PrivyClaims,
  /** Called only when the user must be created (first login). */
  loadProfile?: () => Promise<Pick<PrivyClaims, "email" | "walletAddress">>,
): Promise<AuthUser> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("privy_did", claims.privyDid)
    .maybeSingle();
  if (error) throw new Error(`Failed to load user: ${error.message}`);
  if (data) {
    if (data.status === "suspended") {
      throw new AuthError("FORBIDDEN", "User is suspended");
    }
    return data as AuthUser;
  }

  if (loadProfile && !claims.email && !claims.walletAddress) {
    claims = { ...claims, ...(await loadProfile()) };
  }

  // First login: create a contributor by default (ASSUMPTIONS A4).
  // Two concurrent first logins for the same Privy user can both pass the
  // SELECT above while the row is still absent (e.g. the browser fires more
  // than one `/api/me` on a fresh login), so the INSERT may lose the race and
  // hit the users_privy_did_key unique constraint. The loser then backs off
  // and reads the winner's row instead of failing the request.
  const { data: created, error: createError } = await supabase
    .from("users")
    .insert({
      privy_did: claims.privyDid,
      wallet_address: claims.walletAddress ?? null,
      email: claims.email ?? null,
      role: "contributor",
    })
    .select("*")
    .single();
  if (createError) {
    if (/duplicate key|23505/i.test(createError.message ?? "")) {
      const { data: winner, error: winnerError } = await supabase
        .from("users")
        .select("*")
        .eq("privy_did", claims.privyDid)
        .maybeSingle();
      if (winnerError) {
        throw new Error(`Failed to load user: ${winnerError.message}`);
      }
      if (winner) return winner as AuthUser;
    }
    throw new Error(`Failed to create user: ${createError.message}`);
  }
  return created as AuthUser;
}

/**
 * Cache of Privy clients, keyed by app id + secret. In-memory only; the secret
 * is never logged. Clients are cheap to build but cache the fetched
 * verification key, so reuse avoids an API call per request when no
 * `PRIVY_VERIFICATION_KEY` is configured.
 */
let clientCache: { key: string; client: PrivyClient } | null = null;

function getPrivyClient(appId: string, appSecret: string): PrivyClient {
  const key = `${appId}\u0000${appSecret}`;
  if (clientCache?.key !== key) {
    clientCache = { key, client: new PrivyClient(appId, appSecret, { timeout: 10_000 }) };
  }
  return clientCache.client;
}

/**
 * Verify a Privy access token and return its claims.
 *
 * `verificationKey` (SPKI PEM) is used when provided so verification is fully
 * local; otherwise the SDK fetches the key from the Privy API using
 * `appSecret`. `appSecret` also gates the optional linked-account lookup:
 * tests pass an empty secret to stay offline.
 */
export async function verifyPrivyToken(
  token: string,
  appId: string,
  appSecret: string,
  verificationKey?: string,
  options: { includeProfile?: boolean } = {},
): Promise<PrivyClaims> {
  if (!appId) {
    throw new AuthError("UNAUTHORIZED", "Privy is not configured");
  }

  const privy = getPrivyClient(appId, appSecret);

  let claims;
  try {
    claims = await privy.verifyAuthToken(token, verificationKey);
  } catch {
    // jose / SDK errors (bad signature, wrong issuer/audience, expired, …).
    throw new AuthError("UNAUTHORIZED", "Invalid or expired Privy token");
  }

  const privyDid = claims.userId;
  if (!privyDid) {
    throw new AuthError("UNAUTHORIZED", "Privy token is missing a subject");
  }

  if (options.includeProfile === false) return { privyDid, email: null, walletAddress: null };
  return { privyDid, ...(await fetchPrivyProfile(appId, appSecret, privyDid)) };
}

/**
 * Best-effort email and wallet for a Privy user: only with a real secret
 * (network call, rate-limited); otherwise DID only, per OQ1–OQ3.
 */
/**
 * Every wallet linked to a Privy user (embedded and external), lowercase.
 * Used to prove an address belongs to the caller before sending it anything.
 */
export async function fetchPrivyWallets(appId: string, appSecret: string, privyDid: string): Promise<string[]> {
  if (!appId || !appSecret) return [];
  const user = await getPrivyClient(appId, appSecret).getUserById(privyDid);
  const accounts = (user as unknown as { linkedAccounts?: Array<{ type?: string; address?: string }> }).linkedAccounts ?? [];
  return accounts
    .filter((a) => a.type === "wallet" && typeof a.address === "string")
    .map((a) => (a.address as string).toLowerCase());
}

export async function fetchPrivyProfile(
  appId: string,
  appSecret: string,
  privyDid: string,
): Promise<Pick<PrivyClaims, "email" | "walletAddress">> {
  if (!appId || !appSecret) return { email: null, walletAddress: null };
  try {
    const user = await getPrivyClient(appId, appSecret).getUserById(privyDid);
    return { email: user.email?.address ?? null, walletAddress: user.wallet?.address ?? null };
  } catch {
    return { email: null, walletAddress: null };
  }
}
