# Testing Patterns

**Analysis Date:** 2026-05-01

## Test Framework

**Status:** No formal test framework is currently configured or in use.

**Key Finding:** This codebase has:
- No `jest.config.*`, `vitest.config.*`, or other test runner configuration files
- No test files found (no `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` files)
- No testing libraries in `devDependencies` (jest, vitest, testing-library, etc. are absent)
- No test scripts defined in `package.json` (only `dev`, `build`, `start`, `lint`)

**Current approach:**
- Testing is manual and ad-hoc via script utilities
- Scripts in `/scripts/` folder serve as test runners (e.g., `test-hashtag-selector.ts`, `test-captions.ts`)
- These are one-off scripts executed with `tsx` CLI, not integrated into a test suite

## Script-Based Testing

**Test Scripts Location:**
- `scripts/test-hashtag-selector.ts` — Tests hashtag selection algorithm against live Supabase DB
- `scripts/test-captions.ts` — Tests caption generation (location examined but not fully read)
- `scripts/seed-hashtags.ts` — Data seeding script (likely used for test setup)

**Run Commands:**
```bash
./node_modules/.bin/tsx scripts/test-hashtag-selector.ts    # Run hashtag selector test
./node_modules/.bin/tsx scripts/test-captions.ts            # Run captions test
```

**Example Test Structure:**
From `scripts/test-hashtag-selector.ts`:
```typescript
const TEST_CONTEXTS: { name: string; ctx: ImageContext; platform: Platform }[] = [
  {
    name: "Instagram — Wispy lash closeup, soft-romantic, bedroom",
    platform: "instagram",
    ctx: { category: "lash-closeup", lashStyle: "wispy", vibe: "soft-romantic", scene: "bedroom", skinTone: "medium-deep", seasonal: null, composition: "solo" },
  },
  // ... more test cases
];

async function run() {
  console.log("=== Hashtag Selector Test (Live DB) ===\n");
  for (const test of TEST_CONTEXTS) {
    console.log(`▸ ${test.name}`);
    const tags = await selectHashtagsTest(test.ctx, test.platform);
    // ... assertions via console output
  }
}
```

**Assertion Strategy:**
- Manual assertions via console output
- Verification of results by visual inspection (e.g., checking if hashtags are within platform limits)
- No automated assertion library (no assert module used)
- Tests exit with `process.exit(1)` on error

## Manual Testing Approach

**No Integration Tests:** No tests run in CI/CD pipeline or during build.

**Database Testing:** Tests use live Supabase database directly
- Example: `test-hashtag-selector.ts` fetches from live `hashtags` table
- Tests connect with hardcoded Supabase credentials visible in scripts (security concern)

**Verification:** Tests print results to console for manual validation
- Example output check: `console.log(`Within limit: ${withinLimit ? "✅" : "❌"}`)` 

## API Testing

**Route Handlers:** API endpoints in `app/api/**` have no corresponding test files
- Routes are tested manually via HTTP requests (curl, Postman, etc.)
- Error handling is present (try-catch) but not covered by automated tests
- Database queries are tested against live Supabase (not mocked)

**Error Scenarios:**
- Supabase-specific errors are handled (e.g., `error.code !== "PGRST116"`)
- No test coverage for error paths

## Component Testing

**UI Components:** No component tests exist
- Components in `components/` folder have no test files
- Components use Radix UI primitives and shadcn/ui patterns but are untested
- Props are typed but validation is not tested

## Missing Testing Infrastructure

**Not Configured:**
- No test runner (Jest, Vitest, Playwright)
- No test assertion library (Chai, Expect.js, etc.)
- No mocking library (Sinon, Jest mocks, MSW)
- No fixtures or factory functions for test data
- No CI/CD test pipeline
- No coverage reporting

**Impact:**
- No regression protection
- Manual verification of all features required before deployment
- API changes may break dependent code without detection
- Database schema changes could cause unexpected failures

## Recommended Testing Path

When implementing automated tests, consider:

1. **Unit Tests:** Use Jest or Vitest for isolated function testing (type validation, utility functions, prompt composition)
2. **API Tests:** Mock Supabase with test doubles or use test database instance separate from production
3. **Component Tests:** React Testing Library for UI component behavior
4. **E2E Tests:** Playwright for critical user flows (login, image generation, posting)
5. **Script Tests:** Convert existing `scripts/test-*.ts` to proper test suite structure

## Current Test Coverage

**Automated Coverage:** 0%

**Manual Coverage Areas:**
- Hashtag selection algorithm (via `test-hashtag-selector.ts`)
- Caption generation (via `test-captions.ts`)
- Database connectivity (implicit in API route manual testing)

**Untested Areas:**
- Auth middleware and session management
- Image generation with Gemini/OpenAI
- Cloudinary image upload
- Video generation (HeyGen, Seedance, Replicate)
- Database CRUD operations
- UI component rendering
- Error handling across all layers

---

*Testing analysis: 2026-05-01*
