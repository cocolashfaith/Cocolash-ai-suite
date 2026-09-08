/**
 * lib/seedance/submit-rate-limit.ts — per-session throttle for the two routes
 * that can bill an Enhancor job: POST /api/seedance/generate and
 * POST /api/seedance/[id]/rerender.
 *
 * A single 1080p re-render costs real credits, so a stuck client (or a bored
 * tab) hammering "Approve & Generate" is a money bug, not just noise. Both
 * routes spend one token per *paid* submission before anything is queued.
 *
 * Implementation reuses the token bucket from lib/chat/rate-limit.ts — its
 * `consume(key)` API fits as-is, only the capacity/refill differ.
 *
 * LIMITATION (deliberate, same as the chat limiter): the bucket map lives in
 * process memory, so on serverless the limit is PER INSTANCE, not global. It
 * stops a single runaway client on a warm instance; it is not a billing
 * guarantee. A distributed (Redis/Upstash) limiter is the follow-up if abuse
 * from many cold starts ever shows up in the cost dashboard.
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { RateLimiter, type RateLimitConfig } from "@/lib/chat/rate-limit";

/** 12 paid submissions per 10 minutes per session. */
export const SEEDANCE_SUBMIT_RATE_LIMIT: RateLimitConfig = {
  capacity: 12,
  refillPerMs: 12 / (10 * 60 * 1000),
};

export const seedanceSubmitRateLimiter = new RateLimiter(SEEDANCE_SUBMIT_RATE_LIMIT);

/** Minimal shape both NextRequest and a plain Request-with-cookies satisfy. */
export interface RateLimitRequestLike {
  cookies?: { get(name: string): { value: string } | undefined };
  headers: { get(name: string): string | null };
}

const SUPABASE_AUTH_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Identify the caller WITHOUT storing anything identifying: the Supabase auth
 * cookie (≈ the user id) when present, else the shared access-password cookie,
 * else the forwarded IP. Always hashed, so no session token reaches a log line.
 */
export function submitRateLimitKey(request: RateLimitRequestLike): string {
  const jar = request.cookies;
  if (jar) {
    const cookieHeader = request.headers.get("cookie") ?? "";
    for (const pair of cookieHeader.split(";")) {
      const name = pair.split("=")[0]?.trim();
      if (name && SUPABASE_AUTH_COOKIE.test(name)) {
        const value = jar.get(name)?.value;
        if (value) return `sb:${hash(value)}`;
      }
    }
    const legacy = jar.get("cocolash-auth")?.value;
    if (legacy) return `pw:${hash(legacy)}`;
  }

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim();
  if (ip) return `ip:${hash(ip)}`;

  return "anonymous";
}

/** Test hook: forget every bucket so cases cannot bleed into each other. */
export function resetSeedanceSubmitRateLimit(): void {
  seedanceSubmitRateLimiter.reset();
}

export interface SubmitRateLimitBody {
  error: string;
  code: "rate_limited";
  retryAfterSeconds: number;
}

/**
 * Spend one token. Returns a ready-to-send 429 when the caller is over the
 * limit, or `null` when the submission may proceed.
 */
export function checkSeedanceSubmitRateLimit(
  request: RateLimitRequestLike,
  limiter: RateLimiter = seedanceSubmitRateLimiter
): NextResponse | null {
  const { allowed, resetMs } = limiter.consume(submitRateLimitKey(request));
  if (allowed) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));
  const body: SubmitRateLimitBody = {
    error: `Too many video submissions. Try again in about ${Math.ceil(
      retryAfterSeconds / 60
    )} minute(s).`,
    code: "rate_limited",
    retryAfterSeconds,
  };
  return NextResponse.json(body, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
