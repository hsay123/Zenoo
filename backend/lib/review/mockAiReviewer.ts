/**
 * MockAiReviewer – deterministic stand-in for the Kimi (Moonshot) first-pass
 * image review described in the PRD (§8.1).
 *
 * The real provider is an external call with unknown credentials/latency, so
 * this mock applies transparent heuristics to the submitted payload and returns
 * the same shape a real reviewer would:
 *   { decision, reason_code, confidence, notes, rubric_version }
 *
 * A high-confidence decision is auto-applied by `lib/review/service.ts`; lower
 * confidence leaves the submission in the human queue.
 */

import type {
  ActionSegmentsPayload,
  ImageBoxesPayload,
  Modality,
  ReasonCode,
  ReviewDecision,
} from "@/src/types/api";

export const AI_RUBRIC_VERSION = "mock-v1";

export interface AiReviewInput {
  modality: Modality;
  payload: ImageBoxesPayload | ActionSegmentsPayload;
  labelList: string[];
  /** The job rubric, when set (used by the model reviewer; ignored by the mock). */
  rubric?: Record<string, unknown> | null;
  /**
   * The image under review (model reviewer only). Loaded lazily so the mock
   * never touches storage. Dimensions are the asset's stored pixel size.
   */
  image?: {
    width: number | null;
    height: number | null;
    load: () => Promise<{ data: string; mediaType: ReviewImageMediaType }>;
  };
}

export type ReviewImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface AiReviewResult {
  decision: ReviewDecision;
  reason_code: ReasonCode;
  /** 0–1; compare against AI_CONFIDENCE_THRESHOLD. */
  confidence: number;
  notes: string;
  rubric_version: string;
}

/**
 * A first-pass reviewer. The mock answers synchronously; the model reviewer
 * returns a Promise and may throw — callers await the result and treat any
 * error as "route to a human".
 */
export interface AiReviewer {
  /** "mock" results are labelled mock (rubric_version "mock-v1"). */
  readonly kind?: "mock" | "model";
  review(input: AiReviewInput): AiReviewResult | Promise<AiReviewResult>;
}

export class MockAiReviewer implements AiReviewer {
  readonly kind = "mock" as const;

  review(input: AiReviewInput): AiReviewResult {
    if (input.modality === "video") {
      return {
        decision: "revise",
        reason_code: "IMPRECISE_TIMING",
        confidence: 0.55,
        notes: "Video timing should be reviewed by a human.",
        rubric_version: AI_RUBRIC_VERSION,
      };
    }

    const boxes = (input.payload as ImageBoxesPayload).boxes ?? [];
    if (boxes.length === 0) {
      return {
        decision: "revise",
        reason_code: "MISSING_OBJECTS",
        confidence: 0.8,
        notes: "No objects were labelled; the image is expected to contain some.",
        rubric_version: AI_RUBRIC_VERSION,
      };
    }

    const lowConfidence = boxes.filter((b) => (b.confidence ?? 5) <= 2).length;
    if (lowConfidence / boxes.length > 0.5) {
      return {
        decision: "revise",
        reason_code: "LOW_QUALITY",
        confidence: 0.6,
        notes: "Most boxes were marked low confidence.",
        rubric_version: AI_RUBRIC_VERSION,
      };
    }

    return {
      decision: "accept",
      reason_code: "ACCEPTED",
      confidence: 0.88,
      notes: "Labels look consistent with the rubric.",
      rubric_version: AI_RUBRIC_VERSION,
    };
  }
}

export const mockAiReviewer = new MockAiReviewer();
