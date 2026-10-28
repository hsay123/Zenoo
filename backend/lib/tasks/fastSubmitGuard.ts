/**
 * "Unusually fast" submission detection (ASSUMPTIONS A9, OPEN_QUESTIONS OQ18).
 *
 * The moment a task was claimed is derived from its lease:
 *
 *   claim time = lease_expiry - LEASE_MINUTES
 *
 * If the contributor submits sooner than `FAST_SUBMIT_THRESHOLD_SECONDS` after
 * that derived claim time, the submission is flagged for human review. A flag
 * is never an automatic punishment (PRD §6).
 */

/** Derive the claim timestamp (epoch ms) from a lease expiry. */
export function claimTimeFromLease(
  leaseExpiry: string,
  leaseMinutes: number,
): number {
  return new Date(leaseExpiry).getTime() - leaseMinutes * 60_000;
}

/** Milliseconds elapsed between the derived claim time and submission. */
export function elapsedSinceClaimMs(
  leaseExpiry: string,
  leaseMinutes: number,
  submittedAt: Date,
): number {
  return submittedAt.getTime() - claimTimeFromLease(leaseExpiry, leaseMinutes);
}

export interface FastSubmitParams {
  leaseExpiry: string | null | undefined;
  leaseMinutes: number;
  thresholdSeconds: number;
  submittedAt?: Date;
}

/** True when the submission happened suspiciously soon after the claim. */
export function isFastSubmission(params: FastSubmitParams): boolean {
  if (!params.leaseExpiry) return false;
  const submittedAt = params.submittedAt ?? new Date();
  const elapsed = elapsedSinceClaimMs(
    params.leaseExpiry,
    params.leaseMinutes,
    submittedAt,
  );
  if (!Number.isFinite(elapsed)) return false;
  return elapsed < params.thresholdSeconds * 1000;
}
