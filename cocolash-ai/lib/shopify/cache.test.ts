import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LruCache } from "./cache";

describe("LruCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores and retrieves a value", () => {
    const c = new LruCache<number>(3, 1000);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
  });

  it("expires entries after the TTL", () => {
    const c = new LruCache<number>(3, 1000);
    c.set("a", 1);
    vi.advanceTimersByTime(1001);
    expect(c.get("a")).toBeNull();
  });

  it("evicts the oldest entry when at max", () => {
    const c = new LruCache<number>(2, 1000);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.get("a")).toBeNull();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  it("refreshes recency on get (so it survives more inserts)", () => {
    const c = new LruCache<number>(2, 1000);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1); // touches 'a'
    c.set("c", 3); // should evict 'b' (now older), not 'a'
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBeNull();
    expect(c.get("c")).toBe(3);
  });

  it("clear() empties the cache", () => {
    const c = new LruCache<number>(3, 1000);
    c.set("a", 1);
    c.clear();
    expect(c.get("a")).toBeNull();
    expect(c.size()).toBe(0);
  });
});
