/**
 * In-memory rate limiting for abusive endpoints (task claim/submit).
 *
 * Uses `rate-limiter-flexible`. State is per-process, which is sufficient for
 * the hackathon demo (single Node instance) and keeps us Redis-free.
 */

import { RateLimiterMemory } from "rate-limiter-flexible";
import { HttpError } from "@/lib/api/errors";

interface LimiterConfig {
  points: number;
  duration: number;
}

const limiterCache = new Map<string, RateLimiterMemory>();

function getLimiter(name: string, config: LimiterConfig): RateLimiterMemory {
  const existing = limiterCache.get(name);
  if (existing) return existing;
  const limiter = new RateLimiterMemory({
    keyPrefix: name,
    points: config.points,
    duration: config.duration,
  });
  limiterCache.set(name, limiter);
  return limiter;
}

/**
 * Consume one point for `key` in the named bucket.
 * Throws a 429 `HttpError` when the bucket is exhausted.
 */
export async function consume(
  name: string,
  key: string,
  config: LimiterConfig,
): Promise<void> {
  const limiter = getLimiter(name, config);
  try {
    await limiter.consume(key);
  } catch {
    throw HttpError.rateLimit();
  }
}

/** Test helper: clear all cached limiters. */
export function resetRateLimiters(): void {
  limiterCache.clear();
}
