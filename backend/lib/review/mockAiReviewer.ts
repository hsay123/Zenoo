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
}

export interface AiReviewResult {
  decision: ReviewDecision;
  reason_code: ReasonCode;
  /** 0–1; compare against AI_CONFIDENCE_THRESHOLD. */
  confidence: number;
  notes: string;
  rubric_version: string;
}

export interface AiReviewer {
  review(input: AiReviewInput): AiReviewResult;
}

export class MockAiReviewer implements AiReviewer {
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
