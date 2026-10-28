/**
 * API TypeScript types – backend contract.
 * Frontend teammates can copy or import this file.
 *
 * Every API response is wrapped in:
 *   { data: T }       on success
 *   { error: { code: string; message: string; details?: unknown } }  on failure
 */

// ============================================================
// Enums
// ============================================================

export type UserRole = "buyer" | "contributor" | "reviewer" | "admin";
export type UserStatus = "active" | "suspended";

export type Modality = "image" | "video";

export type JobStatus = "draft" | "published" | "paused" | "closed";

export type TaskStatus =
  | "available"
  | "claimed"
  | "draft"
  | "submitted"
  | "needs_revision"
  | "accepted"
  | "rejected"
  | "appealed"
  | "paid";

export type ReviewerType = "code" | "ai" | "human";

export type ReviewDecision = "accept" | "revise" | "reject";

export type AppealStatus = "open" | "accepted" | "rejected";

/**
 * Reason codes for review decisions.
 * Frontend should display human-readable labels for each code.
 */
export type ReasonCode =
  // Automatic / code checks
  | "SCHEMA_INVALID"          // payload failed schema validation
  | "BOX_OUT_OF_BOUNDS"       // one or more boxes exceed image dimensions
  | "BOX_NEGATIVE_SIZE"       // box w or h <= 0
  | "BOX_INVALID_CLASS"       // class not in job label list
  | "SEGMENT_OUT_OF_BOUNDS"   // segment exceeds clip duration
  | "SEGMENT_OVERLAP"         // segments overlap each other
  | "SEGMENT_ORDER"           // segments not in ascending order
  | "SEGMENT_MISSING_FAILURE_REASON" // outcome=failure without failure_reason
  | "GOLD_FAIL"               // failed hidden gold task
  | "DUPLICATE_PAYLOAD"       // identical payload hash already submitted
  | "FAST_SUBMISSION_FLAG"    // submitted suspiciously fast (human review triggered)
  // AI / human review
  | "LOW_QUALITY"             // general quality issue
  | "MISSING_OBJECTS"         // expected objects not labelled
  | "WRONG_CLASS"             // correct box position but wrong class
  | "IMPRECISE_TIMING"        // segment times too loose
  | "INCONSISTENT_LABELS"     // contradictory or conflicting labels
  | "RUBRIC_VIOLATION"        // specific rubric criterion not met
  // Appeal outcomes
  | "APPEAL_UPHELD"           // human reviewer reversed the decision
  | "APPEAL_DISMISSED"        // original decision stands
  // Positive outcome
  | "ACCEPTED";               // all checks passed

// ============================================================
// Action labels and outcomes (video schema)
// ============================================================

export type ActionLabel =
  | "reach" | "grasp" | "lift" | "place"
  | "inspect" | "recover" | "write" | "other";

export type SegmentOutcome = "success" | "partial" | "failure" | "unknown";

// ============================================================
// Core entity shapes returned by the API
// ============================================================

export interface User {
  id: string;
  wallet_address: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  onboarding_completed: boolean;
  onboarding_account_type: "buyer" | "contributor" | null;
  organization_id: string | null;
}

/** Subset of a contributor profile returned by GET /api/me. */
export interface MeProfile {
  qualification_passed: boolean;
  tasks_completed: number;
  gold_accuracy: number | null;
}

/** Response shape for GET /api/me. */
export interface CurrentUser extends User {
  profile: MeProfile | null;
}

export interface ContributorProfile {
  user_id: string;
  qualification_passed: boolean;
  qualification_score: number | null;
  gold_accuracy: number | null;
  revision_rate: number | null;
  tasks_completed: number;
  consent_version: string | null;
  consented_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  buyer_id: string;
  name: string;
  data_rights: string | null;
  retention_policy: string | null;
  created_at: string;
}

export interface Asset {
  id: string;
  project_id: string;
  content_hash: string;
  modality: Modality;
  duration_ms: number | null;   // video
  width: number | null;          // image
  height: number | null;         // image
  consent_ref: string | null;
  // Note: object_key is never returned (server-only)
}

export interface SchemaVersion {
  id: string;
  modality: Modality;
  schema_name: string;
  json_schema: Record<string, unknown>;
  label_list: string[];
  version_hash: string;
  created_at: string;
  // Note: json_schema is not returned to reduce payload size
}

export interface Job {
  id: string;
  project_id: string;
  schema_version_id: string | null;
  title: string;
  description: string | null;
  modality: Modality;
  reward_per_task: string;   // decimal string (numeric precision)
  budget: string;
  deadline: string | null;
  policy_hash: string | null;
  rubric: Record<string, unknown> | null;
  status: JobStatus;
  chain_job_id: string | null;
  label_list: string[];
  created_at: string;
  updated_at: string;
  // Funding fields
  funding_status: "unfunded" | "pending" | "funded" | "failed";
  funded_amount: string | null;
  funding_tx_hash: string | null;
  funding_wallet_address: string | null;
  funded_at: string | null;
  is_demo: boolean;
}

export interface Task {
  id: string;
  job_id: string;
  asset_id: string;
  modality: Modality;
  status: TaskStatus;
  is_gold: boolean;
  lease_owner: string | null;
  lease_expiry: string | null;
  job_title?: string;
  label_list?: string[];
  // signed_media_url: only present on GET /api/tasks/:id
  signed_media_url?: string;
  created_at: string;
  updated_at: string;
  is_demo: boolean;
  // Note: gold_answer is never returned to contributors
}

/** Response shape for PUT /api/tasks/:id/draft. */
export interface DraftSaveResult {
  task_id: string;
  saved_at: string;
}

/** Response shape for POST /api/tasks/:id/claim. */
export interface ClaimResult {
  task_id: string;
  lease_expiry: string;
  signed_media_url: string;
}

export interface Submission {
  id: string;
  task_id: string;
  contributor_id: string;
  version: number;
  payload: ImageBoxesPayload | ActionSegmentsPayload;
  payload_hash: string;
  schema_version: string;
  is_fast_flag: boolean;
  submitted_at: string;
}

export interface Review {
  id: string;
  submission_id: string;
  reviewer_type: ReviewerType;
  reviewer_id: string | null;
  decision: ReviewDecision;
  reason_code: ReasonCode;
  confidence: number | null;
  rubric_version: string | null;
  notes: string | null;
  created_at: string;
}

/** A submission awaiting review, with its task and job for context. */
export interface ReviewQueueItem extends Submission {
  task: Task;
  job: Job;
}

export interface Appeal {
  id: string;
  submission_id: string;
  contributor_id: string;
  reason: string;
  status: AppealStatus;
  adjudicator_id: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** An open appeal with its submission, task and job for reviewer context. */
export interface AppealQueueItem extends Appeal {
  submission: Submission;
  task: Task;
  job: Job;
}

export interface Receipt {
  id: string;
  submission_id: string;
  annotation_hash: string;
  policy_hash: string;
  review_ref: string | null;
  tx_hash: string | null;
  is_mock: boolean;
  created_at: string;
}

/** Minimal public receipt returned by GET /api/receipts/{id} (no auth). */
export interface PublicReceipt {
  id: string;
  task_id: string;
  policy_hash: string;
  annotation_hash: string;
  reviewer_type: ReviewerType | null;
  tx_hash: string | null;
  is_mock: boolean;
  created_at: string;
}

/** Provenance manifest bundled with an accepted-label export. */
export interface ExportManifest {
  dataset_id: string;
  schema_version: string;
  asset_hashes: Record<string, string>;
  rights_reference: string | null;
  review_policy_version: string | null;
  export_time: string;
  record_counts: {
    total: number;
    image: number;
    video: number;
  };
}

// ============================================================
// Annotation payload schemas
// ============================================================

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  class: string;
  confidence?: number; // 1–5
}

export interface ImageBoxesPayload {
  task_id: string;
  asset_id: string;
  schema_version: "image-boxes-v1";
  boxes: BoundingBox[];
  answers?: Record<string, string>;
}

export interface ActionSegment {
  start_ms: number;
  end_ms: number;
  action_label: ActionLabel;
  object?: string;
  outcome: SegmentOutcome;
  failure_reason?: string;
  confidence: number; // 1–5
}

export interface ActionSegmentsPayload {
  task_id: string;
  asset_id: string;
  schema_version: "action-segments-v1";
  segments: ActionSegment[];
}

// ============================================================
// Request body types
// ============================================================

export interface CreateJobRequest {
  project_id: string;
  title: string;
  description?: string;
  modality: Modality;
  reward_per_task: number;
  budget: number;
  deadline?: string;         // ISO 8601
  rubric?: Record<string, unknown>;
  label_list: string[];
  schema_version_id?: string;
}

export interface ReviewDecisionRequest {
  decision: ReviewDecision;
  reason_code: ReasonCode;
  confidence?: number;       // 0–1 for AI; omit for human
  notes?: string;
  rubric_version?: string;
}

export interface AppealRequest {
  reason: string;
}

export interface SettlementAcceptRequest {
  task_id: string;
  submission_id: string;
}

// ============================================================
// Response shapes
// ============================================================

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface EarningsSummary {
  total_accepted: number;
  total_paid: string;           // decimal string
  total_pending: string;        // accepted but not yet paid
  tasks: Array<{
    task_id: string;
    submission_id: string;
    job_title: string;
    status: TaskStatus;
    reward: string;
    submitted_at: string;
    receipt_id: string | null;
    settlement_is_mock: boolean | null;
    tx_hash: string | null;
  }>;
}

export interface UploadUrlResult {
  upload_url: string;
  object_key: string;
}

// All types are defined as interfaces above.