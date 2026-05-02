import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to capacity, then denies", () => {
    const r = new RateLimiter({ capacity: 3, refillPerMs: 0 });
    expect(r.consume("a", 0).allowed).toBe(true);
    expect(r.consume("a", 0).allowed).toBe(true);
    expect(r.consume("a", 0).allowed).toBe(true);
    expect(r.consume("a", 0).allowed).toBe(false);
  });

  it("refills tokens over time", () => {
    const r = new RateLimiter({ capacity: 2, refillPerMs: 1 / 1000 }); // 1 token/sec
    r.consume("a", 0);
    r.consume("a", 0);
    expect(r.consume("a", 0).allowed).toBe(false);
    expect(r.consume("a", 1100).allowed).toBe(true); // ~1.1 tokens accrued
  });

  it("buckets are per-key", () => {
    const r = new RateLimiter({ capacity: 1, refillPerMs: 0 });
    expect(r.consume("a", 0).allowed).toBe(true);
    expect(r.consume("b", 0).allowed).toBe(true);
    expect(r.consume("a", 0).allowed).toBe(false);
  });

  it("reports a usable resetMs estimate", () => {
    const r = new RateLimiter({ capacity: 1, refillPerMs: 1 / 1000 });
    r.consume("a", 0);
    const denied = r.consume("a", 0);
    expect(denied.allowed).toBe(false);
    expect(denied.resetMs).toBeGreaterThan(0);
  });
});
