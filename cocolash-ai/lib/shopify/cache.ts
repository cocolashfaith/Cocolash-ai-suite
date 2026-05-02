/**
 * lib/shopify/cache.ts — In-memory LRU cache for Storefront API responses.
 *
 * Per-process; survives across requests within a Vercel function instance
 * but resets on cold start. Used to absorb 429s gracefully (D-03, D-04).
 *
 * Default TTL 15 min, max 50 entries. The eviction policy is naive
 * insertion-order (Map preserves insertion order in JS) which is fine for
 * a 50-entry cache.
 */

interface Entry<T> {
  value: T;
  expires: number;
}

export class LruCache<T> {
  private readonly max: number;
  private readonly ttlMs: number;
  private store: Map<string, Entry<T>> = new Map();

  constructor(max: number = 50, ttlMs: number = 15 * 60 * 1000) {
    this.max = max;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    // Refresh recency: re-insert at end.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.store.size > this.max) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  has(key: string): boolean {
    const v = this.get(key);
    return v !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
