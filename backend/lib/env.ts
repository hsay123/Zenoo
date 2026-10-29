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
  // Real AI first pass (HHG F3). Used only when ANTHROPIC_API_KEY is set and
  // AI_REVIEWER is not "mock"; otherwise the MockAiReviewer stays in effect.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_REVIEWER: z.enum(["auto", "mock"]).optional().default("auto"),
  AI_REVIEW_MODEL: z.string().optional().default("claude-sonnet-5-5"),
  AI_REVIEW_EFFORT: z.enum(["low", "medium", "high"]).optional().default("medium"),
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
  // Contributor reputation (HHG F4). Gating applies to task listing and
  // claiming; "off" lets every contributor see every task (as before F4).
  REPUTATION_GATING: z.enum(["on", "off"]).optional().default("on"),
  REPUTATION_VERIFIED_MIN_GOLD: z.coerce.number().int().min(0).optional().default(5),
  REPUTATION_VERIFIED_MIN_GOLD_ACCURACY: z.coerce.number().min(0).max(100).optional().default(80),
  REPUTATION_TRUSTED_MIN_ACCEPTED: z.coerce.number().int().min(0).optional().default(50),
  REPUTATION_TRUSTED_MIN_SCORE: z.coerce.number().min(0).max(100).optional().default(85),
  REPUTATION_REVIEWER_MIN_ACCEPTED: z.coerce.number().int().min(0).optional().default(200),
  REPUTATION_REVIEWER_MIN_SCORE: z.coerce.number().min(0).max(100).optional().default(92),
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
  // Settlement chain: 84532 = Base Sepolia (default), 8453 = Base. The preflight
  // only allows the chains in SETTLEMENT_ALLOWED_CHAIN_IDS (lib/settlement/network.ts).
  CHAIN_ID: z
    .string()
    .optional()
    .default("84532")
    .refine((v) => /^\d+$/.test(v.trim()), "CHAIN_ID must be a positive integer")
    .transform((v) => parseInt(v.trim(), 10)),
  RPC_URL: z.string().url().optional(),
  // Deprecated alias for RPC_URL (prior Monad-testnet deployments). Read only
  // when RPC_URL is unset, so existing configs keep loading; a Monad RPC then
  // fails the chain check and settlement stays on the mock.
  MONAD_RPC_URL: z.string().url().optional(),
  // ERC-20 the escrow holds (USDC, 6 decimals). The preflight requires the
  // escrow's on-chain token() to equal this address.
  USDC_ADDRESS: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^0x[0-9a-fA-F]{40}$/.test(v),
      "USDC_ADDRESS must be a 0x-prefixed address",
    ),
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
  // ROADMAP DEMO (HHG F5): deployed RoyaltySplitter. Unset = preview only.
  ROYALTY_SPLITTER_ADDRESS: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^0x[0-9a-fA-F]{40}$/.test(v),
      "ROYALTY_SPLITTER_ADDRESS must be a 0x-prefixed address",
    ),
  // ── Buyer funding (HHG F2) ──
  // Zeno's commission as a share of what the buyer pays, in basis points
  // (2000 = 20%: the contributor keeps 80% of the buyer price). The escrow
  // holds only contributor payouts; the fee is charged on top of them.
  ZENO_FEE_BPS: z
    .string()
    .optional()
    .default("2000")
    .refine((v) => /^\d+$/.test(v.trim()) && parseInt(v, 10) < 10_000, "ZENO_FEE_BPS must be 0-9999")
    .transform((v) => parseInt(v.trim(), 10)),
  // Platform treasury signer that funds escrow after a verified card/UPI
  // payment. Server-only; must differ from the escrow owner and the
  // settlement relayer. Unset: paid jobs wait as "paid, awaiting funding".
  TREASURY_PRIVATE_KEY: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^0x[0-9a-fA-F]{64}$/.test(v),
      "TREASURY_PRIVATE_KEY must be a 32-byte 0x-prefixed private key",
    ),
  // Dodo Payments (card/UPI). All three must be set for the card option to
  // appear. Only test mode is supported this week (no real funds).
  DODO_API_KEY: z.string().optional(),
  DODO_WEBHOOK_SECRET: z.string().optional(),
  // A pay-what-you-want product created in the Dodo dashboard; each checkout
  // overrides its amount with the job's total.
  DODO_PRODUCT_ID: z.string().optional(),
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
