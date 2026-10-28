/**
 * Unit tests for real Privy access-token verification.
 *
 * A local ES256 keypair signs tokens so the SDK verifies entirely offline —
 * no Privy API call is made. `appSecret` is empty, which also disables the
 * linked-account lookup (that path is network-bound and not exercised here).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, exportSPKI, SignJWT } from "jose";
import { AuthError } from "../errors";
import { verifyPrivyToken } from "../verifyToken";

const APP_ID = "cl_test_app_id";
const DID = "did:privy:cm0000000000000000000000";

let publicPem: string;
let privateKey: CryptoKey;
let wrongKey: CryptoKey;

const now = () => Math.floor(Date.now() / 1000);

interface TokenOptions {
  sub?: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  key?: CryptoKey;
}

async function signToken(opts: TokenOptions = {}): Promise<string> {
  return new SignJWT({ sid: "ses_test_123" })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuer(opts.iss ?? "privy.io")
    .setAudience(opts.aud ?? APP_ID)
    .setSubject(opts.sub ?? DID)
    .setIssuedAt(opts.iat ?? now())
    .setExpirationTime(opts.exp ?? now() + 3600)
    .sign(opts.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  const wrong = await generateKeyPair("ES256", { extractable: true });
  publicPem = await exportSPKI(pair.publicKey);
  privateKey = pair.privateKey;
  wrongKey = wrong.privateKey;
});

describe("verifyPrivyToken", () => {
  it("accepts a valid token and returns the DID", async () => {
    const token = await signToken();
    const claims = await verifyPrivyToken(token, APP_ID, "", publicPem);
    expect(claims.privyDid).toBe(DID);
    expect(claims.email).toBeNull();
    expect(claims.walletAddress).toBeNull();
  });

  it("strips a 'Bearer ' prefix", async () => {
    const token = await signToken();
    const claims = await verifyPrivyToken(`Bearer ${token}`, APP_ID, "", publicPem);
    expect(claims.privyDid).toBe(DID);
  });

  it("rejects a token signed by the wrong key", async () => {
    const token = await signToken({ key: wrongKey });
    await expect(verifyPrivyToken(token, APP_ID, "", publicPem)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("rejects an expired token", async () => {
    const token = await signToken({ iat: now() - 7200, exp: now() - 3600 });
    await expect(verifyPrivyToken(token, APP_ID, "", publicPem)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("rejects the wrong audience (aud != appId)", async () => {
    const token = await signToken({ aud: "some_other_app" });
    await expect(verifyPrivyToken(token, APP_ID, "", publicPem)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("rejects the wrong issuer", async () => {
    const token = await signToken({ iss: "https://evil.example" });
    await expect(verifyPrivyToken(token, APP_ID, "", publicPem)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("rejects malformed input", async () => {
    await expect(verifyPrivyToken("not-a-jwt", APP_ID, "", publicPem)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("fails clearly when no app id is configured", async () => {
    await expect(verifyPrivyToken("x", "", "")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
