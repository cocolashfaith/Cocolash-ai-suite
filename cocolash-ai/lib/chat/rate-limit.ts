/**
 * lib/chat/rate-limit.ts — Simple per-key token bucket.
 *
 * Per-process; survives within a Vercel function instance, resets on
 * cold start. Default: 30 events / 5 minutes. Distributed Redis-backed
 * limiter is out of scope for v3.0; per-key per-process is sufficient
 * given Coco's expected volume + Stage-1 deployment surface.
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimitConfig {
  capacity: number;     // max tokens
  refillPerMs: number;  // tokens per millisecond
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  capacity: 30,
  refillPerMs: 30 / (5 * 60 * 1000), // 30 / 5 minutes = 0.0001 token/ms
};

export class RateLimiter {
  private readonly cfg: RateLimitConfig;
  private readonly buckets: Map<string, Bucket> = new Map();
  private readonly maxBuckets: number;

  constructor(cfg: RateLimitConfig = DEFAULT_RATE_LIMIT, maxBuckets: number = 10000) {
    this.cfg = cfg;
    this.maxBuckets = maxBuckets;
  }

  /**
   * Try to spend one token from `key`'s bucket. Returns whether the call
   * is allowed and the remaining tokens (clamped to capacity).
   */
  consume(key: string, now: number = Date.now()): { allowed: boolean; remaining: number; resetMs: number } {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.cfg.capacity, lastRefillMs: now };
      this.buckets.set(key, b);
      this.evictIfNeeded();
    } else {
      const elapsed = Math.max(0, now - b.lastRefillMs);
      b.tokens = Math.min(this.cfg.capacity, b.tokens + elapsed * this.cfg.refillPerMs);
      b.lastRefillMs = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, remaining: Math.floor(b.tokens), resetMs: 0 };
    }
    const tokensNeeded = 1 - b.tokens;
    const waitMs = Math.ceil(tokensNeeded / this.cfg.refillPerMs);
    return { allowed: false, remaining: 0, resetMs: waitMs };
  }

  private evictIfNeeded(): void {
    while (this.buckets.size > this.maxBuckets) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

// Default singleton for the chat route to share across requests.
export const chatRateLimiter = new RateLimiter();
