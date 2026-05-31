# Testing Patterns

**Analysis Date:** 2026-05-31

## Test Framework

**Runner:**
- Vitest `^2.1.8`
- Config: `cocolash-ai/vitest.config.ts`
- Environment: `node` (not jsdom)
- Global test API: Disabled (`globals: false`)

**Assertion Library:**
- Vitest built-in expect (Chai-based)
- No external assertion library needed

**Run Commands:**
```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode with auto-rerun
npm run lint             # ESLint (separate from tests)
```

**Config Details:**
```typescript
// vitest.config.ts
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "lib/seedance/ugc-image-prompt.test-examples.ts",
    ],
    environment: "node",
    globals: false,
    reporters: "default",
  },
});
```

## Test File Organization

**Location:** Co-located with source files or in dedicated test directories

**Patterns:**
1. **Co-located (most common):** Test file in same directory as source
   - `lib/log.ts` → `lib/log.test.ts`
   - `lib/chat/intent.ts` → `lib/chat/intent.test.ts`
   - `lib/shopify/cache.ts` → `lib/shopify/cache.test.ts`

2. **Separate test directories:** Complex suites in `tests/` folder
   - `tests/seedance-payloads/` — Video payload generation tests (10 test files)
   - `tests/seedance-director/` — AI director logic tests (5 test files)
   - `tests/brand/` — Brand and category logic tests

**Naming:**
- `*.test.ts` for unit/integration tests
- `*.test.tsx` for component tests (rare)

**Test File Count:** 427 test files across codebase

## Test Structure

**Standard Suite Organization:**
```typescript
import { describe, it, expect } from "vitest"
import { SomeService } from "./some-service"

describe("SomeService", () => {
  it("does thing A", () => {
    // Arrange
    const service = new SomeService()
    
    // Act
    const result = service.doThing()
    
    // Assert
    expect(result).toBe(expected)
  })

  it("handles error condition", () => {
    const service = new SomeService()
    expect(() => service.badOperation()).toThrow()
  })
})
```

**Patterns Observed:**

### Setup/Teardown
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

describe("LruCache", () => {
  beforeEach(() => {
    vi.useFakeTimers()  // Setup fakes
  })
  
  afterEach(() => {
    vi.useRealTimers()  // Cleanup
    vi.restoreAllMocks()
    delete process.env.LOG_LEVEL
  })

  it("test with setup", () => {
    // Test body
  })
})
```

### Assertion Patterns
```typescript
// Simple equality
expect(result).toBe(expected)
expect(result).toEqual({ a: 1, b: 2 })

// Type checks
expect(typeof obj.ts).toBe("string")

// String matching
expect(msg).toMatch(/PRODUCT TRUTH \(use as anchor/i)
expect(msg).toMatch(/^- Lash type:\s*clusters\s*\(4-12mm\)$/m)  // Multi-line
expect(msg).not.toContain("PRODUCT TRUTH")

// Property existence
expect(payload).toHaveProperty("prompt", "expected value")
expect(payload).not.toHaveProperty("images")

// Comparison
expect(denied.resetMs).toBeGreaterThan(0)
expect(c.get("a")).toBeNull()

// Array/Collection
expect(stdout).toHaveBeenCalledTimes(1)
expect(stdout).toHaveBeenCalled()

// Error testing
expect(() => service.fail()).toThrow()
expect(() => service.badInput()).toThrow(SpecificError)
```

## Mocking

**Framework:** Vitest's `vi` module (no external mocking library)

**Patterns:**

### Spy & Mock Functions
```typescript
// Spy on process.stdout
const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)

// Verify calls
expect(spy).toHaveBeenCalled()
expect(spy).toHaveBeenCalledTimes(1)

// Access call arguments
const arg = (spy.mock.calls[0]?.[0] ?? "") as string
const obj = JSON.parse(arg.trim())

// Cleanup
vi.restoreAllMocks()
```

### Fake Timers
```typescript
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it("waits before retry", () => {
  const r = new RateLimiter({ capacity: 2, refillPerMs: 1 / 1000 })
  r.consume("a", 0)
  r.consume("a", 0)
  expect(r.consume("a", 0).allowed).toBe(false)
  expect(r.consume("a", 1100).allowed).toBe(true)  // Simulate 1.1 sec passage
  
  // Or explicit advancement:
  vi.advanceTimersByTime(1001)
  expect(result).toBe(expected)
})
```

**What to Mock:**
- External service calls (not needed here; mocked by contract tests)
- System calls: `process.stdout`, `process.stderr`
- Timers when testing delays and retries
- Random sources when determinism needed

**What NOT to Mock:**
- Pure helper functions (test real implementations)
- Type constructors unless testing error conditions
- Business logic (test actual behavior)
- Example: `parseIntent` is not mocked; tested with real inputs

## Fixtures and Factories

**Test Data Pattern:**
```typescript
// Base object for reuse
const baseInput: Partial<DirectorInput> = {
  mode: "ugc",
  campaignType: "product-showcase",
  tone: "casual",
  durationSeconds: 15,
  aspectRatio: "9:16",
  script: "Look at how this Jasmine cluster lash sits in its tray.",
  composedPersonProductImage: {
    url: "https://example.com/composed.jpg",
  },
}

// Test-specific variants
it("injects the PRODUCT TRUTH header", () => {
  const input: DirectorInput = {
    ...baseInput,
    productTruth: { ... },
  } as DirectorInput
  
  const msg = composeUserMessage(input)
  expect(msg).toMatch(/PRODUCT TRUTH/)
})

it("another scenario", () => {
  const input: DirectorInput = {
    ...baseInput,
    productTruth: { ... different values ... },
  } as DirectorInput
})
```

**Location:**
- Inline in test files using object spread and override pattern
- No external fixture files or factory functions (keep tests self-contained)
- Constants for enumerated values: `INTENT_LABELS` tested via iteration

### Loop-Based Test Generation
```typescript
describe("parseIntent", () => {
  for (const label of INTENT_LABELS) {
    it(`recognises bare label "${label}"`, () => {
      expect(parseIntent(label)).toBe(label)
    })
  }
})
```

## Coverage

**Requirements:** No enforced coverage targets detected

**View Coverage:**
```bash
npm run test -- --coverage  # (If vitest.config.ts adds coverage reporter)
```

Coverage configuration not present in `vitest.config.ts`.

## Test Types

**Unit Tests (Dominant):**
- Pure function testing: `parseIntent()`, helpers
- Class methods: `LruCache.get()`, `LruCache.evict()`
- Parser/formatter logic: intent classification, payload builders
- Error handling: fallback behavior, retries
- Scope: Single function or class method in isolation
- Example: `lib/log.test.ts` (52 lines, 4 tests for log levels + field merging)

**Integration Tests:**
- Contract testing for payload generation: `tests/seedance-payloads/*.test.ts`
- Director prompt injection: `tests/seedance-director/*.test.ts`
- Multi-component workflows: Category coverage across product types
- Scope: Multiple modules working together but no external API calls
- Example: `tests/seedance-director/product-truth-injection.test.ts` (201 lines, 8 tests for canonical field format)

**E2E Tests:**
- Not yet implemented in this codebase
- Playwright mentioned in global rules (`rules/testing.md`)
- Would use `e2e-runner` agent when implemented

## Common Patterns

### Async Testing
```typescript
// Vitest implicit async support (no done callback)
it("awaits async operation", async () => {
  const result = await classifyIntent("hello")
  expect(result.intent).toBe("other")
})

// Or with then()
it("uses promises", () => {
  return classifyIntent("hello").then(result => {
    expect(result.intent).toBe("other")
  })
})
```

### Error Testing
```typescript
// Throw expectation
it("throws on invalid input", () => {
  expect(() => {
    new ChatError("msg", 500, "invalid_code") // Actually succeeds, so...
  }).toThrow()
})

// Actually test custom errors:
it("constructs ChatError with code", () => {
  const err = new ChatError("Missing API key", 500, "missing_api_key")
  expect(err.status).toBe(500)
  expect(err.code).toBe("missing_api_key")
  expect(err.message).toBe("Missing API key")
})

// Test error throwing from async function:
it("throws on bad request", async () => {
  await expect(classifyIntent("")).rejects.toThrow()
})
```

### Regex Anchor Tests (Contract Tests)
```typescript
// Strict regex matching to enforce canonical format
it("emits canonical field labels (not loose substring matching)", () => {
  const msg = composeUserMessage(input)
  
  // Anchored: must be on own line, exact spacing
  expect(msg).toMatch(/^- Lash type:\s*clusters\s*\(4-12mm\)$/m)
  
  // Tightened: full phrase, not substring
  expect(msg).toMatch(/^- Magnetic closure:\s*NO\s*—\s*never claim magnetic$/m)
  
  // Forbidden: loose match would silently pass if prompt drifts
  // DO NOT: expect(msg).toContain("Lash type: clusters")
})
```

**Rationale:** Phase 27 (Wave-6) added regex-anchored tests to catch prompt drift in CI rather than silently degrading AI output quality.

## Test Execution

**Run all tests:**
```bash
npm run test
```

**Run in watch mode:**
```bash
npm run test:watch
```

**Test output format:** Default Vitest reporter (console output with summary)

**Parallel execution:** Vitest default (parallel by default unless `singleThread: true`)

## Mocking External Services

**Pattern:** Not mocked in unit tests; tested via contract tests (payloads)

**Rationale:**
- API clients return typed responses
- Payload builders tested with real data structures
- Models (Gemini, OpenRouter, HeyGen) specified explicitly in code comments
- Cost tracking tested with spy on database calls, not API mocks

**Example:** `lib/openrouter/chat.ts` not unit-tested directly; integration tested via chat eval script (`scripts/chat-eval.ts`)

## Known Test Gaps

1. **E2E tests:** Not implemented. Would cover full user flows (generate image → upload → publish)
2. **Component tests:** Rare; UI primarily tested manually
3. **console.log() calls:** Not covered by tests; identified as legacy in CONCERNS.md
4. **External API mocking:** Service tests assume real credentials; would need fixture/stub layer for CI

---

*Testing analysis: 2026-05-31*
