/**
 * Centralised environment validation.
 * Called once at startup. Throws if required vars are missing.
 * Required vars in production differ from development.
 */

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  // Private storage bucket for job media (signed URLs are generated per request)
  SUPABASE_STORAGE_BUCKET: z.string().min(1).optional().default("media"),
  FRONTEND_ORIGIN: z.string().url("FRONTEND_ORIGIN must be a valid URL").default("http://localhost:3001"),
  // Privy – required in production, optional in dev when DEV_AUTH_BYPASS=true
  PRIVY_APP_ID: z.string().optional(),
  PRIVY_APP_SECRET: z.string().optional(),
  // Optional SPKI PEM verification key copied from the Privy dashboard. When
  // set, access tokens are verified locally without an API round-trip.
  PRIVY_VERIFICATION_KEY: z.string().optional(),
  // DEV-only bypass
  DEV_AUTH_BYPASS: z.enum(["true", "false"]).optional().default("false"),
  // AI review
  AI_CONFIDENCE_THRESHOLD: z
    .string()
    .optional()
    .default("0.75")
    .transform((v) => parseFloat(v)),
  // Settlement
  LEASE_MINUTES: z
    .string()
    .optional()
    .default("30")
    .transform((v) => parseInt(v, 10)),
  // Gold task thresholds
  GOLD_IOU_THRESHOLD: z
    .string()
    .optional()
    .default("0.5")
    .transform((v) => parseFloat(v)),
  GOLD_SEGMENT_MS_TOLERANCE: z
    .string()
    .optional()
    .default("500")
    .transform((v) => parseInt(v, 10)),
  // Fraud control: submissions faster than this after claim are flagged for
  // human review (ASSUMPTIONS A9, OPEN_QUESTIONS OQ18).
  FAST_SUBMIT_THRESHOLD_SECONDS: z
    .string()
    .optional()
    .default("30")
    .transform((v) => parseInt(v, 10)),
  // JobEscrow contract + settlement relayer. Real settlement is selected only
  // when all three are set AND the fail-closed preflight passes; with any
  // missing, or any preflight check failing, MockSettlementService stays in
  // effect (receipts stay is_mock = true).
  JOB_ESCROW_ADDRESS: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^0x[0-9a-fA-F]{40}$/.test(v),
      "JOB_ESCROW_ADDRESS must be a 0x-prefixed address",
    ),
  MONAD_RPC_URL: z.string().url().optional(),
  SETTLEMENT_PRIVATE_KEY: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^0x[0-9a-fA-F]{64}$/.test(v),
      "SETTLEMENT_PRIVATE_KEY must be a 32-byte 0x-prefixed private key",
    ),
  // Comma-separated deny-list of addresses that must never act as the
  // settlement signer or escrow owner (e.g. a key known to have been exposed).
  // REQUIRED before real settlement can be enabled: the preflight fails closed
  // when it is empty, and it is merged with a built-in list of known-compromised
  // addresses that can never be removed from the environment alone.
  SETTLEMENT_FORBIDDEN_ADDRESS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }

  const env = parsed.data;

  // Production guards
  if (env.NODE_ENV === "production") {
    if (env.DEV_AUTH_BYPASS === "true") {
      throw new Error("DEV_AUTH_BYPASS must not be 'true' in production");
    }
    if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
      throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required in production");
    }
  }

  _env = env;
  return env;
}
