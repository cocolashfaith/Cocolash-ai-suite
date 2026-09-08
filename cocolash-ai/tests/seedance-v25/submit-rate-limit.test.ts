/**
 * The per-session throttle in front of the two routes that can bill an Enhancor
 * job. Unit-level: the key derivation must never put a raw session token in the
 * bucket map (or, by extension, in a log line), and separate sessions must not
 * share a bucket.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { RateLimiter } from "@/lib/chat/rate-limit";
import {
  SEEDANCE_SUBMIT_RATE_LIMIT,
  checkSeedanceSubmitRateLimit,
  resetSeedanceSubmitRateLimit,
  submitRateLimitKey,
} from "@/lib/seedance/submit-rate-limit";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://app.example.com/api/seedance/generate", {
    method: "POST",
    headers,
  });
}

describe("submitRateLimitKey", () => {
  it("prefers the Supabase auth cookie (≈ the user id)", () => {
    const key = submitRateLimitKey(
      req({ cookie: "sb-exkdmmxbrsgefpciyqkz-auth-token=abc123; cocolash-auth=pw" })
    );
    expect(key.startsWith("sb:")).toBe(true);
    expect(key).not.toContain("abc123");
  });

  it("falls back to the shared access-password cookie", () => {
    const key = submitRateLimitKey(req({ cookie: "cocolash-auth=super-secret-token" }));
    expect(key.startsWith("pw:")).toBe(true);
    expect(key).not.toContain("super-secret-token");
  });

  it("falls back to the forwarded client IP", () => {
    const key = submitRateLimitKey(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(key.startsWith("ip:")).toBe(true);
    expect(key).not.toContain("203.0.113.7");
  });

  it("is stable for one session and different across sessions", () => {
    const a1 = submitRateLimitKey(req({ cookie: "cocolash-auth=alice" }));
    const a2 = submitRateLimitKey(req({ cookie: "cocolash-auth=alice" }));
    const b = submitRateLimitKey(req({ cookie: "cocolash-auth=bob" }));
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it("degrades to a single shared bucket when nothing identifies the caller", () => {
    expect(submitRateLimitKey(req())).toBe("anonymous");
  });
});

describe("checkSeedanceSubmitRateLimit", () => {
  beforeEach(() => {
    resetSeedanceSubmitRateLimit();
  });

  it("allows the configured burst, then 429s with code rate_limited", () => {
    const limiter = new RateLimiter(SEEDANCE_SUBMIT_RATE_LIMIT);
    const session = req({ cookie: "cocolash-auth=alice" });

    for (let i = 0; i < SEEDANCE_SUBMIT_RATE_LIMIT.capacity; i++) {
      expect(checkSeedanceSubmitRateLimit(session, limiter)).toBeNull();
    }

    const blocked = checkSeedanceSubmitRateLimit(session, limiter);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(Number(blocked!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("returns the documented error body", async () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerMs: 1 / 600_000 });
    const session = req({ cookie: "cocolash-auth=alice" });

    expect(checkSeedanceSubmitRateLimit(session, limiter)).toBeNull();
    const blocked = checkSeedanceSubmitRateLimit(session, limiter)!;
    const json = (await blocked.json()) as {
      error: string;
      code: string;
      retryAfterSeconds: number;
    };

    expect(json.code).toBe("rate_limited");
    expect(json.error).toContain("Too many video submissions");
    expect(json.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("budgets 12 submissions per 10 minutes", () => {
    expect(SEEDANCE_SUBMIT_RATE_LIMIT.capacity).toBe(12);
    // Full refill takes 10 minutes.
    expect(SEEDANCE_SUBMIT_RATE_LIMIT.capacity / SEEDANCE_SUBMIT_RATE_LIMIT.refillPerMs).toBe(
      10 * 60 * 1000
    );
  });

  it("does not let one session spend another session's budget", () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerMs: 1 / 600_000 });
    const alice = req({ cookie: "cocolash-auth=alice" });
    const bob = req({ cookie: "cocolash-auth=bob" });

    expect(checkSeedanceSubmitRateLimit(alice, limiter)).toBeNull();
    expect(checkSeedanceSubmitRateLimit(alice, limiter)).not.toBeNull();
    expect(checkSeedanceSubmitRateLimit(bob, limiter)).toBeNull();
  });
});
