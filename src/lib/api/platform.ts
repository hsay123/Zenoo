/**
 * Zeno platform client (real backend contract).
 * -------------------------------------------------------------------
 * One typed HTTP client for the Next.js API in `backend/`. Every response is
 * parsed with a zod schema at this boundary, so screens never trust unvalidated
 * JSON. Base URL comes from `NEXT_PUBLIC_API_BASE_URL`; the bearer token is
 * supplied by `getToken` (a Privy access token in the running app).
 *
 * This module is the live contract. The older `client.ts` sample/preview layer
 * is kept only for the unconnected interface preview and is never used when a
 * base URL is configured.
 */

import { z } from "zod";

// ---------------------------------------------------------------- schemas

export const userRoleSchema = z.enum(["buyer", "contributor", "reviewer", "admin"]);
export const userStatusSchema = z.enum(["active", "suspended"]);
export const modalitySchema = z.enum(["image", "video"]);
export const jobStatusSchema = z.enum(["draft", "published", "paused", "closed"]);
export const taskStatusSchema = z.enum([
  "available",
  "claimed",
  "draft",
  "submitted",
  "needs_revision",
  "accepted",
  "rejected",
  "appealed",
  "paid",
]);
export const reviewerTypeSchema = z.enum(["code", "ai", "human"]);
export const decisionSchema = z.enum(["accept", "revise", "reject"]);
export const appealStatusSchema = z.enum(["open", "accepted", "rejected"]);

/** Annotation payloads, mirroring backend `lib/validation/payloads.ts`. */
export const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  class: z.string(),
  confidence: z.number().optional(),
});

export const actionSegmentSchema = z.object({
  start_ms: z.number(),
  end_ms: z.number(),
  action_label: z.string(),
  object: z.string().optional(),
  outcome: z.string(),
  failure_reason: z.string().optional(),
  confidence: z.number(),
});

export const imageBoxesPayloadSchema = z.object({
  task_id: z.string(),
  asset_id: z.string(),
  schema_version: z.literal("image-boxes-v1"),
  boxes: z.array(boundingBoxSchema),
  answers: z.record(z.string(), z.string()).optional(),
});

export const actionSegmentsPayloadSchema = z.object({
  task_id: z.string(),
  asset_id: z.string(),
  schema_version: z.literal("action-segments-v1"),
  segments: z.array(actionSegmentSchema),
});

export const annotationPayloadSchema = z.discriminatedUnion("schema_version", [
  imageBoxesPayloadSchema,
  actionSegmentsPayloadSchema,
]);

export const meProfileSchema = z.object({
  qualification_passed: z.boolean(),
  tasks_completed: z.number(),
  gold_accuracy: z.number().nullable(),
});

export const currentUserSchema = z.object({
  id: z.string(),
  wallet_address: z.string().nullable(),
  email: z.string().nullable(),
  role: userRoleSchema,
  status: userStatusSchema,
  created_at: z.string(),
  onboarding_completed: z.boolean(),
  onboarding_account_type: z.enum(["buyer", "contributor"]).nullable(),
  organization_id: z.string().nullable(),
  profile: meProfileSchema.nullable(),
});

export const onboardingCompleteRequestSchema = z.object({
  account_type: z.enum(["buyer", "contributor"]),
  organization_name: z.string().min(1).max(100).optional(),
});

export const onboardingCompleteResponseSchema = z.object({
  onboarding_completed: z.boolean(),
  redirect: z.string(),
  account_type: z.enum(["buyer", "contributor"]).nullable().optional(),
  organization_id: z.string().nullable().optional(),
});

export type OnboardingCompleteRequest = z.infer<typeof onboardingCompleteRequestSchema>;
export type OnboardingCompleteResponse = z.infer<typeof onboardingCompleteResponseSchema>;

export const projectSchema = z.object({
  id: z.string(),
  buyer_id: z.string(),
  name: z.string(),
  data_rights: z.string().nullable(),
  retention_policy: z.string().nullable(),
  created_at: z.string(),
});

export const assetSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  content_hash: z.string(),
  modality: modalitySchema,
  duration_ms: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  consent_ref: z.string().nullable(),
});

export const jobSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  schema_version_id: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  modality: modalitySchema,
  reward_per_task: z.string(),
  budget: z.string(),
  deadline: z.string().nullable(),
  policy_hash: z.string().nullable(),
  rubric: z.record(z.string(), z.unknown()).nullable(),
  status: jobStatusSchema,
  chain_job_id: z.string().nullable(),
  label_list: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  // Funding fields
  funding_status: z.enum(["unfunded", "pending", "funded", "failed"]),
  funded_amount: z.string().nullable(),
  funding_tx_hash: z.string().nullable(),
  funding_wallet_address: z.string().nullable(),
  funded_at: z.string().nullable(),
  is_demo: z.boolean(),
});

/* Buyer funding (HHG F2) — GET /api/jobs/{id}/funding */
const txRequestSchema = z.object({ to: z.string(), data: z.string() });

export const jobFundingSchema = z.object({
  job_id: z.string(),
  funding_status: z.enum(["unfunded", "pending", "funded", "failed"]),
  display_status: z.enum(["unfunded", "pending", "paid_awaiting_funding", "funded", "closed"]),
  quote: z.object({
    payout: z.string(),
    fee: z.string(),
    total: z.string(),
    fee_bps: z.number(),
    payout_units: z.string(),
    total_cents: z.number(),
  }),
  task_count: z.number(),
  reward_per_task: z.union([z.string(), z.number()]).transform(String),
  chain: z.object({
    chain_id: z.number(),
    allowed: z.boolean(),
    escrow_address: z.string().nullable(),
    token_address: z.string().nullable(),
    token_decimals: z.number(),
  }),
  methods: z.object({
    wallet: z.boolean(),
    card: z.boolean(),
    card_auto_funding: z.boolean(),
    card_available: z.boolean().optional(),
    card_unavailable_reason: z.string().nullable().optional(),
  }),
  wallet_tx: z
    .object({
      funding_wallet_address: z.string(),
      chain_job_id: z.string(),
      amount_units: z.string(),
      approve: txRequestSchema,
      fund: txRequestSchema,
    })
    .nullable(),
  payment: z
    .object({
      id: z.string(),
      status: z.enum(["created", "paid", "funding", "funded", "failed"]),
      amount_cents: z.number(),
      currency: z.string(),
      funding_tx_hash: z.string().nullable(),
      error: z.string().nullable(),
      paid_at: z.string().nullable(),
      funded_at: z.string().nullable(),
    })
    .nullable(),
});

/* Integrity flags (HHG F6.2) — admin only. */
const flagAccountSchema = z
  .object({
    id: z.string(),
    email: z.string().nullable(),
    wallet_address: z.string().nullable(),
    role: z.string(),
  })
  .nullable();

export const integrityFlagSchema = z.object({
  id: z.string(),
  signal: z.enum(["wallet_link", "duplicate_work", "self_dealing", "linked_review"]),
  evidence: z.record(z.string(), z.unknown()),
  status: z.enum(["open", "confirmed", "cleared"]),
  source: z.enum(["local", "tigergraph"]),
  created_at: z.string(),
  updated_at: z.string(),
  user: flagAccountSchema,
  related: flagAccountSchema,
});
export type IntegrityFlag = z.infer<typeof integrityFlagSchema>;

export const integrityFlagListSchema = z.object({
  engine: z.enum(["local", "tigergraph"]),
  items: z.array(integrityFlagSchema),
});

export const integrityRunSchema = z.object({
  engine: z.enum(["local", "tigergraph"]),
  accounts: z.number(),
  submissions: z.number(),
  flags: z.number(),
  by_signal: z.record(z.string(), z.number()),
});

export const integrityFlagUpdateSchema = z.object({
  id: z.string(),
  status: z.enum(["open", "confirmed", "cleared"]),
  resolved_at: z.string().nullable(),
});

/** POST /api/demo/royalty — ROADMAP DEMO (HHG F5), admin only. */
export const royaltyDemoSchema = z.object({
  demo: z.literal("roadmap"),
  mode: z.enum(["preview", "live"]),
  live_available: z.boolean(),
  live_unavailable_reason: z.string().nullable(),
  plan: z.object({
    job_id: z.string(),
    amount: z.string(),
    data_owner: z.string(),
    contributors: z.array(
      z.object({ wallet: z.string(), accepted_labels: z.number(), share: z.string() }),
    ),
    skipped_without_wallet: z.number(),
    shares: z.object({ zeno: z.string(), data_owner: z.string(), contributors: z.string() }),
  }),
  sale_id: z.string().optional(),
  tx_hash: z.string().optional(),
});
export type RoyaltyDemo = z.infer<typeof royaltyDemoSchema>;

/** POST /api/jobs/{id}/fund — the funding intent (only `job` is used here). */
export const fundIntentSchema = z.object({ job: jobSchema }).passthrough();

/** POST /api/jobs/{id}/fund/checkout */
export const meSyncSchema = z.object({
  email: z.string().nullable(),
  wallet_address: z.string().nullable(),
  linked_wallets: z.array(z.string()),
});
export const payoutWalletSchema = z.object({ wallet_address: z.string() });

export const faucetGrantSchema = z.object({
  usdc_units: z.string(),
  gas_wei: z.string(),
  usdc_tx_hash: z.string().nullable(),
  gas_tx_hash: z.string().nullable(),
  already_funded: z.boolean(),
});

export const fundCheckoutSchema = z.object({
  payment_id: z.string(),
  checkout_url: z.string().url(),
});

export const taskSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  asset_id: z.string(),
  modality: modalitySchema,
  status: taskStatusSchema,
  is_gold: z.boolean(),
  lease_owner: z.string().nullable(),
  lease_expiry: z.string().nullable(),
  job_title: z.string().optional(),
  label_list: z.array(z.string()).optional(),
  signed_media_url: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  is_demo: z.boolean(),
});

export const claimResultSchema = z.object({
  task_id: z.string(),
  lease_expiry: z.string(),
  signed_media_url: z.string(),
});

export const draftSaveResultSchema = z.object({
  task_id: z.string(),
  saved_at: z.string(),
});

/** Result of POST /api/assets/upload-url (a short-lived signed upload target). */
export const uploadUrlResultSchema = z.object({
  upload_url: z.string(),
  object_key: z.string(),
  token: z.string().optional(),
  method: z.string().optional(),
});

/** A versioned annotation as returned by submit / review-queue endpoints. */
export const submissionSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  contributor_id: z.string(),
  version: z.number(),
  payload: annotationPayloadSchema,
  payload_hash: z.string(),
  schema_version: z.string(),
  is_fast_flag: z.boolean(),
  submitted_at: z.string(),
});

export const reviewSchema = z.object({
  id: z.string(),
  submission_id: z.string(),
  reviewer_type: reviewerTypeSchema,
  reviewer_id: z.string().nullable(),
  decision: decisionSchema,
  reason_code: z.string(),
  confidence: z.number().nullable(),
  rubric_version: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

export const reviewQueueItemSchema = submissionSchema.extend({
  task: taskSchema,
  job: jobSchema,
});

export const appealSchema = z.object({
  id: z.string(),
  submission_id: z.string(),
  contributor_id: z.string(),
  reason: z.string(),
  status: appealStatusSchema,
  adjudicator_id: z.string().nullable(),
  resolution_notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const appealQueueItemSchema = appealSchema.extend({
  submission: submissionSchema,
  task: taskSchema,
  job: jobSchema,
});

/** Minimal public receipt returned by GET /api/receipts/{id} (no auth). */
export const publicReceiptSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  policy_hash: z.string(),
  annotation_hash: z.string(),
  reviewer_type: reviewerTypeSchema.nullable(),
  tx_hash: z.string().nullable(),
  is_mock: z.boolean(),
  created_at: z.string(),
});

/** Admin user projection (no contributor profile). */
export const adminUserSchema = z.object({
  id: z.string(),
  wallet_address: z.string().nullable(),
  email: z.string().nullable(),
  role: userRoleSchema,
  status: userStatusSchema,
  created_at: z.string(),
});

export const exportManifestSchema = z.object({
  dataset_id: z.string(),
  schema_version: z.string(),
  asset_hashes: z.record(z.string(), z.string()),
  rights_reference: z.string().nullable(),
  review_policy_version: z.string().nullable(),
  export_time: z.string(),
  record_counts: z.object({
    total: z.number(),
    image: z.number(),
    video: z.number(),
  }),
});

export const receiptSchema = z.object({
  id: z.string(),
  submission_id: z.string(),
  annotation_hash: z.string(),
  policy_hash: z.string(),
  review_ref: z.string().nullable(),
  tx_hash: z.string().nullable(),
  is_mock: z.boolean(),
  created_at: z.string(),
});

export const earningsSummarySchema = z.object({
  total_accepted: z.number(),
  total_paid: z.string(),
  total_pending: z.string(),
  tasks: z.array(
    z.object({
      task_id: z.string(),
      submission_id: z.string(),
      job_title: z.string(),
      status: taskStatusSchema,
      reward: z.string(),
      submitted_at: z.string(),
      receipt_id: z.string().nullable(),
      settlement_is_mock: z.boolean().nullable(),
      tx_hash: z.string().nullable(),
    }),
  ),
  /* HHG F4 — additive; null/absent when the backend could not compute it. */
  reputation: z
    .object({
      tier: z.enum(["new", "verified", "trusted", "reviewer"]),
      earned_tier: z.enum(["new", "verified", "trusted", "reviewer"]),
      tier_floor: z.enum(["new", "verified", "trusted", "reviewer"]).nullable(),
      score: z.number().nullable(),
      gold_accuracy: z.number().nullable(),
      acceptance_rate: z.number().nullable(),
      gating: z.boolean(),
      stats: z.object({
        goldPassed: z.number(),
        goldFailed: z.number(),
        accepted: z.number(),
        rejected: z.number(),
        revised: z.number(),
      }),
      next: z
        .object({
          tier: z.enum(["new", "verified", "trusted", "reviewer"]),
          needs: z.array(z.string()),
        })
        .nullable(),
    })
    .nullable()
    .optional(),
});

/**
 * The contributor's in-progress annotation for a task (`GET /tasks/{id}/draft`).
 * `payload` is the saved draft, or the last submitted payload when the task is
 * being revised; `null` when there is nothing yet.
 */
export const workPayloadSchema = z.object({
  payload: annotationPayloadSchema.nullable(),
  saved_at: z.string().nullable(),
  source: z.enum(["draft", "submission"]).nullable(),
});

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number(),
    page: z.number(),
    per_page: z.number(),
  });
}

export type CurrentUser = z.infer<typeof currentUserSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Task = z.infer<typeof taskSchema>;
export type ClaimResult = z.infer<typeof claimResultSchema>;
export type Receipt = z.infer<typeof receiptSchema>;

// ── Data API (docs/system/DATA-API.md) ──
export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});
/** Only the create response carries the full key, once. */
export const apiKeyCreatedSchema = apiKeySchema.extend({ key: z.string() });
export const apiPlanSchema = z.object({
  plan: z.enum(["none", "api"]),
  status: z.string().nullable(),
  renews_at: z.string().nullable(),
  price_usd: z.number(),
  interval: z.string(),
  checkout_available: z.boolean(),
  test_mode: z.boolean(),
});
export const apiPlanCheckoutSchema = z.object({ checkout_url: z.string().url() });
export type ApiKey = z.infer<typeof apiKeySchema>;

// ── Slack/Discord alerts (viaSocket App integrations) ──
export const alertConnectionSchema = z.object({
  app: z.enum(["slack", "discord"]),
  name: z.string(),
  icon: z.string(),
  destination: z.object({ kind: z.enum(["channel", "user"]), label: z.string().nullable() }).nullable(),
  events: z.array(z.string()),
  last_sent_at: z.string().nullable(),
  last_error: z.string().nullable(),
});
export const integrationsSchema = z.object({
  available: z.boolean(),
  apps: z.array(
    z.object({ app: z.enum(["slack", "discord"]), name: z.string(), icon: z.string(), pickers: z.array(z.string()) }),
  ),
  events: z.array(z.object({ event: z.string(), label: z.string(), default_on: z.boolean() })),
  connections: z.array(alertConnectionSchema),
});
export const integrationsTokenSchema = z.object({
  token: z.string(),
  service_ids: z.record(z.string(), z.string()),
  actions: z.record(z.string(), z.string()),
});
export const destinationOptionsSchema = z.array(z.object({ label: z.string(), value: z.string() }));
export type AlertConnection = z.infer<typeof alertConnectionSchema>;
export type Integrations = z.infer<typeof integrationsSchema>;
export type ApiPlan = z.infer<typeof apiPlanSchema>;

/**
 * POST /api/reviews/{id}/decision answers `{ review, receipt }`: an accepted
 * submission on a funded job is settled straight away, and `receipt` is that
 * payout's receipt (null otherwise, or if settlement is retried later).
 */
export const reviewDecisionResultSchema = z.object({
  review: reviewSchema,
  receipt: receiptSchema.nullable(),
});
export type EarningsSummary = z.infer<typeof earningsSummarySchema>;
export type UploadUrlResult = z.infer<typeof uploadUrlResultSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
export type Appeal = z.infer<typeof appealSchema>;
export type AppealQueueItem = z.infer<typeof appealQueueItemSchema>;
export type PublicReceipt = z.infer<typeof publicReceiptSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type ExportManifest = z.infer<typeof exportManifestSchema>;
export type AnnotationPayload = z.infer<typeof annotationPayloadSchema>;
export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type ActionSegment = z.infer<typeof actionSegmentSchema>;
export type WorkPayload = z.infer<typeof workPayloadSchema>;

/**
 * The two schema versions seeded by the backend (migration 003).
 *
 * The API exposes no "list schema versions" endpoint, so the wizard ships the
 * canonical seeded ids/labels. The ids are immutable rows created by migration;
 * they are not invented here.
 */
export const SCHEMA_VERSIONS = {
  image: {
    id: "a0000000-0000-0000-0000-000000000001",
    name: "image-boxes-v1",
    labels: ["cup", "red_block", "blue_block", "hand", "robot_arm", "other"],
  },
  video: {
    id: "a0000000-0000-0000-0000-000000000002",
    name: "action-segments-v1",
    labels: [
      "reach",
      "grasp",
      "lift",
      "place",
      "inspect",
      "recover",
      "write",
      "other",
    ],
  },
} as const;

// ---------------------------------------------------------------- client

export type PlatformErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "RATE_LIMIT"
  | "SERVER"
  | "NETWORK"
  | "OFFLINE";

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(code: PlatformErrorCode, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type TokenProvider = () => Promise<string | null> | string | null;

export interface PlatformClientOptions {
  baseUrl: string;
  getToken?: TokenProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Adds an `Idempotency-Key` header (claim/draft/submit/accept/decision/appeal). */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

const ERROR_CODES: Record<number, PlatformErrorCode> = {
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION",
  429: "RATE_LIMIT",
};

export class PlatformClient {
  private readonly appBase: string;
  private readonly getToken?: TokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: PlatformClientOptions) {
    this.appBase = opts.baseUrl.replace(/\/$/, "");
    this.getToken = opts.getToken;
    // Bind to globalThis: the browser's `fetch` is a method of `window` and
    // throws "Illegal invocation" if it is called with any other receiver
    // (e.g. `this.fetchImpl(...)` inside `request`). A stored reference must
    // be bound before use.
    this.fetchImpl = (opts.fetchImpl ?? globalThis.fetch).bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  async request<T>(schema: z.ZodType<T>, path: string, opts: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = opts.signal ?? controller.signal;

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    if (this.getToken) {
      const token = await this.getToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.appBase}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        cache: "no-store",
        signal,
      });
    } catch (cause) {
      throw new PlatformError(
        "NETWORK",
        cause instanceof Error ? cause.message : "Network request failed",
      );
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();
    const parsedBody = raw ? safeJson(raw) : null;

    if (!response.ok) {
      const code = ERROR_CODES[response.status] ?? "SERVER";
      const message =
        (parsedBody as { error?: { message?: string } } | null)?.error?.message ??
        `${response.status} ${response.statusText}`;
      const details = (parsedBody as { error?: { details?: unknown } } | null)?.error?.details;
      throw new PlatformError(code, message, response.status, details);
    }

    const envelope = parsedBody as { data?: unknown } | null;
    const result = schema.safeParse(envelope?.data);
    if (!result.success) {
      throw new PlatformError("SERVER", "Response did not match the expected shape", response.status, result.error.issues);
    }
    return result.data;
  }

  get<T>(schema: z.ZodType<T>, path: string, opts?: RequestOptions) {
    return this.request(schema, path, { ...opts, method: "GET" });
  }
  post<T>(schema: z.ZodType<T>, path: string, opts?: RequestOptions) {
    return this.request(schema, path, { ...opts, method: "POST" });
  }
  put<T>(schema: z.ZodType<T>, path: string, opts?: RequestOptions) {
    return this.request(schema, path, { ...opts, method: "PUT" });
  }
  patch<T>(schema: z.ZodType<T>, path: string, opts?: RequestOptions) {
    return this.request(schema, path, { ...opts, method: "PATCH" });
  }

  /**
   * Fetch a binary attachment (the export endpoint streams a file, not the
   * `{ data }` JSON envelope). Auth is identical; errors are mapped the same
   * way so screens can render them.
   */
  async download(
    path: string,
    opts?: { signal?: AbortSignal },
  ): Promise<{ blob: Blob; filename: string | null }> {
    const headers: Record<string, string> = {};
    if (this.getToken) {
      const token = await this.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.appBase}${path}`, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: opts?.signal,
      });
    } catch (cause) {
      throw new PlatformError(
        "NETWORK",
        cause instanceof Error ? cause.message : "Network request failed",
      );
    }

    if (!response.ok) {
      const raw = await response.text();
      const parsedBody = raw ? safeJson(raw) : null;
      const code = ERROR_CODES[response.status] ?? "SERVER";
      const message =
        (parsedBody as { error?: { message?: string } } | null)?.error?.message ??
        `${response.status} ${response.statusText}`;
      const details = (parsedBody as { error?: { details?: unknown } } | null)?.error?.details;
      throw new PlatformError(code, message, response.status, details);
    }

    const disposition = response.headers.get("content-disposition") ?? "";
    const match = /filename="?([^";]+)"?/.exec(disposition);
    return { blob: await response.blob(), filename: match?.[1] ?? null };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Path builders for the real backend, in one place. */
export const platformPaths = {
  me: () => "/api/me",
  health: () => "/api/health",
  projects: () => "/api/projects",
  uploadUrl: () => "/api/assets/upload-url",
  assets: () => "/api/assets",
  jobs: () => "/api/jobs",
  job: (id: string) => `/api/jobs/${id}`,
  publishJob: (id: string) => `/api/jobs/${id}/publish`,
  pauseJob: (id: string) => `/api/jobs/${id}/pause`,
  resumeJob: (id: string) => `/api/jobs/${id}/resume`,
  closeJob: (id: string) => `/api/jobs/${id}/close`,
  jobFunding: (id: string) => `/api/jobs/${id}/funding`,
  fundJob: (id: string) => `/api/jobs/${id}/fund`,
  fundJobConfirm: (id: string) => `/api/jobs/${id}/fund/confirm`,
  fundJobCheckout: (id: string) => `/api/jobs/${id}/fund/checkout`,
  fundJobFaucet: (id: string) => `/api/jobs/${id}/faucet`,
  meSync: () => "/api/me/sync",
  mePayoutWallet: () => "/api/me/payout-wallet",
  royaltyDemo: () => "/api/demo/royalty",
  integrityFlags: (status = "open") => `/api/admin/integrity/flags?status=${status}`,
  integrityFlag: (id: string) => `/api/admin/integrity/flags/${id}`,
  integrityRun: () => "/api/admin/integrity/run",
  jobTasks: (id: string) => `/api/jobs/${id}/tasks`,
  jobExport: (id: string) => `/api/jobs/${id}/export`,
  availableTasks: () => "/api/tasks/available",
  task: (id: string) => `/api/tasks/${id}`,
  claimTask: (id: string) => `/api/tasks/${id}/claim`,
  saveDraft: (id: string) => `/api/tasks/${id}/draft`,
  submitTask: (id: string) => `/api/tasks/${id}/submit`,
  reviewQueue: () => "/api/review/queue",
  appealsQueue: () => "/api/review/appeals/queue",
  reviewDecision: (submissionId: string) => `/api/reviews/${submissionId}/decision`,
  appeal: (submissionId: string) => `/api/submissions/${submissionId}/appeal`,
  appealDecision: (appealId: string) => `/api/appeals/${appealId}/decision`,
  settlementAccept: () => "/api/settlement/accept",
  receipt: (id: string) => `/api/receipts/${id}`,
  earnings: () => "/api/earnings",
  adminUsers: () => "/api/admin/users",
  adminUserRole: (id: string) => `/api/admin/users/${id}/role`,
  onboardingComplete: () => "/api/onboarding/complete",
  apiKeys: () => "/api/api-keys",
  apiKey: (id: string) => `/api/api-keys/${id}`,
  apiPlan: () => "/api/billing/api-plan",
  apiPlanCheckout: () => "/api/billing/api-plan/checkout",
  integrations: () => "/api/integrations",
  integrationsToken: () => "/api/integrations/token",
  integration: (app: string) => `/api/integrations/${app}`,
  integrationConnected: (app: string) => `/api/integrations/${app}/connected`,
  integrationOptions: (app: string, kind: string) => `/api/integrations/${app}/options?kind=${kind}`,
  integrationTest: (app: string) => `/api/integrations/${app}/test`,
} as const;

export const isPlatformConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_API_BASE_URL);

/** Create a client from the public env (throws if unconfigured). */
export function createPlatformClient(getToken?: TokenProvider): PlatformClient {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new PlatformError(
      "OFFLINE",
      "NEXT_PUBLIC_API_BASE_URL is not set; the platform API is not configured.",
    );
  }
  return new PlatformClient({ baseUrl, getToken });
}
