# Codebase Concerns

**Analysis Date:** 2026-05-31

## Tech Debt

**Console Logging in Production Code:**
- Issue: 80 instances of `console.log()` throughout the codebase, used primarily for debugging and audit trails. While some logging is intentional (e.g., Seedance payload auditing), the volume suggests ad-hoc debugging statements may remain in production paths.
- Files: `cocolash-ai/lib/seedance/client.ts`, `cocolash-ai/app/api/generate/route.ts`, and 78+ other API and library files
- Impact: Degrades performance in high-volume scenarios; makes production logs noisy; no structured logging framework for proper observability at scale. Cannot easily adjust log levels per environment.
- Fix approach: Migrate to the existing `log` utility (`cocolash-ai/lib/log.ts`) which supports structured JSON logging and `LOG_LEVEL` environment variable. Replace all `console.log/error/warn` calls with `log.info/error/warn`. Retain only critical audit trails.

**Type Safety: Partial Type Casting in API Routes:**
- Issue: Multiple API routes use `Record<string, unknown>` validation patterns with manual type coercion (e.g., `as SkinTone`, `as LashStyle`). While validation helpers exist, they rely on casting after string checks rather than strict Zod schema validation.
- Files: `cocolash-ai/app/api/generate/route.ts`, `cocolash-ai/app/api/seedance/generate/route.ts`, `cocolash-ai/app/api/heygen/generate-studio-avatar/route.ts`
- Impact: Runtime type errors possible if validation logic is incomplete; harder to maintain consistent validation across endpoints; no single source of truth for request shape validation.
- Fix approach: Adopt Zod schema validation for all request body parsing (already in dependencies). Create schema files mirroring the validation helpers in each route. Export inferred types to replace scattered `Record<string, unknown>` patterns.

**Large Component Files with Mixed Concerns:**
- Issue: `cocolash-ai/components/video/AvatarSetup.tsx` (1,406 lines), `cocolash-ai/components/video/seedance/SeedanceGenerateStep.tsx` (950 lines), `cocolash-ai/components/settings/HashtagManager.tsx` (807 lines) combine state management, form logic, API calls, and UI rendering in single files.
- Files: `cocolash-ai/components/video/AvatarSetup.tsx`, `cocolash-ai/components/video/seedance/SeedanceGenerateStep.tsx`, `cocolash-ai/components/video/seedance-v4/modes/UgcMode.tsx`
- Impact: Hard to test individual features; increased bug surface; difficult refactoring; slow to locate specific logic; cognitive load for maintainers.
- Fix approach: Extract form state into custom hooks (`useAvatarForm`, `useGenerateForm`). Move API call logic to separate handler modules. Create smaller sub-components for each section (e.g., `<EthnicitySkinToneSelector />`). Aim for <300 line components.

**Unstructured Error Handling in API Routes:**
- Issue: 906 try-catch blocks but no uniform error response format. Some routes catch and rethrow, others transform errors inline. Error messages sometimes expose implementation details (e.g., Supabase error messages in responses).
- Files: `cocolash-ai/app/api/generate/route.ts`, `cocolash-ai/app/api/seedance/generate/route.ts`, `cocolash-ai/app/api/videos/[id]/status/route.ts`
- Impact: Clients cannot reliably parse error responses; inconsistent HTTP status codes for same error types; potential info leakage about internal systems.
- Fix approach: Create a centralized error handler wrapper for API routes. Define typed error response interfaces. Always map service errors (GeminiError, HeyGenError, SeedanceError, ChatError) to safe, public error messages. See `cocolash-ai/lib/chat/error.ts` as a pattern to extend.

## Known Bugs

**Fetch Timeout Risk in Image Processing:**
- Symptoms: `cocolash-ai/app/api/generate/route.ts` fetches reference images from URLs with no explicit timeout. Long-running fetches (>300s) will exceed Vercel's maxDuration limit and crash the request.
- Files: `cocolash-ai/app/api/generate/route.ts` (lines 345-349), `cocolash-ai/lib/image-processing/before-after-compositor.ts`
- Trigger: Reference images hosted on slow CDN or temporarily unavailable; user generates image with product category that has reference images.
- Workaround: Set a 10-second fetch timeout or pre-cache reference images in Supabase Storage with fast TTL headers.
- Fix approach: Wrap all `fetch()` calls with a timeout utility. Set sensible defaults per endpoint type (5s for reference images, 30s for webhooks). Log timeouts as warnings, not errors, to distinguish from real failures.

**Supabase Error Propagation Without Context:**
- Symptoms: Multiple routes check `if (error || !data)` but log only the Supabase error message, losing request context needed to debug data issues.
- Files: `cocolash-ai/app/api/generate/route.ts` (lines 298-304), `cocolash-ai/app/api/seedance/generate/route.ts`, `cocolash-ai/app/api/brand/route.ts`
- Trigger: Brand profile missing, product category not found, or database permission issues.
- Workaround: Check admin database directly to verify record exists before testing flow.
- Fix approach: Enhance Supabase error handling to include request params in logs. Create a `supabaseError()` helper that wraps errors with context (table name, filter, expected count).

**No Retry Logic on Transient Network Errors:**
- Symptoms: HeyGen and Seedance clients have retry logic (`withRetry()`, `isTransientNetworkError()`), but Gemini, Elevenlabs, and Replicate clients do not.
- Files: `cocolash-ai/lib/heygen/client.ts` (lines 44-58), but missing from `cocolash-ai/lib/gemini/`, `cocolash-ai/lib/elevenlabs/`, and `cocolash-ai/lib/replicate/` (if present)
- Impact: One random DNS timeout or connection reset will fail the entire generation, forcing user to retry. Affects image generation, caption generation, and composition.
- Fix approach: Extract `isTransientNetworkError()` and `withRetry()` to a shared utility. Apply uniformly to all external API calls.

## Security Considerations

**API Key Validation Gaps:**
- Risk: Environment variables (`GEMINI_API_KEY`, `HEYGEN_API_KEY`, etc.) are checked only at request time, not during app startup. Invalid keys cause cascading failures instead of early failure.
- Files: `cocolash-ai/lib/heygen/client.ts` (line 30), `cocolash-ai/lib/seedance/client.ts` (line 26), `cocolash-ai/lib/shotstack/client.ts` (line 20)
- Current mitigation: Error is thrown when API is first invoked, caught by try-catch in route handlers.
- Recommendations: Add a startup hook that validates all required environment variables. Return clear error messages. Add healthcheck endpoint to verify API key validity before accepting requests.

**Sensitive Data in Logs:**
- Risk: Request bodies and API payloads logged for debugging (e.g., Seedance prompt at line 79-98 of `cocolash-ai/lib/seedance/client.ts`) may contain user data or product descriptions. Console logs are not sanitized.
- Files: `cocolash-ai/lib/seedance/client.ts`, `cocolash-ai/app/api/generate/route.ts`, `cocolash-ai/app/api/videos/generate/route.ts`
- Current mitigation: Logs are truncated in some cases (prompt head/tail), but not consistently.
- Recommendations: Create a sanitization utility. Redact user-facing text, product descriptions, and image URLs from logs. Separate audit logs (non-sensitive) from debug logs (sensitive, dev-only).

**Insufficient Rate Limiting:**
- Risk: Chat API (`cocolash-ai/app/api/chat/route.ts`) has lead capture email but no rate limiting on the POST endpoint itself. Users could spam message submissions or exhaust cost caps.
- Files: `cocolash-ai/app/api/chat/route.ts`, `cocolash-ai/lib/chat/rate-limit.ts`
- Current mitigation: Per-session cost cap enforced, but no request-per-minute limit.
- Recommendations: Implement IP-based or session-based rate limiting (e.g., 10 requests/minute per IP). Return 429 status when exceeded. Log to detect abuse patterns.

**No Input Sanitization on Prompt Injection Risk:**
- Risk: User context notes, custom instructions, and product descriptions are inserted directly into AI prompts without sanitization. Prompt injection attacks (e.g., "ignore previous instructions") could bypass lash-focused generation.
- Files: `cocolash-ai/lib/prompts/compose.ts`, `cocolash-ai/lib/prompts/categories/product.ts`, `cocolash-ai/components/video/AvatarSetup.tsx`
- Current mitigation: Text is substring-limited (max 100 chars for context notes), but not escaped or validated.
- Recommendations: Sanitize user input before prompt insertion. Use role markers or delimiters (e.g., `<user_input>.....</user_input>`). Periodically audit generated prompts for injection patterns.

## Performance Bottlenecks

**Image Composition on Critical Path:**
- Problem: Before-After image composition (Replicate, ~2-3 min) blocks the API response. User waits synchronously for composite to complete during image generation.
- Files: `cocolash-ai/app/api/generate/route.ts` (maxDuration=300s), `cocolash-ai/lib/image-processing/before-after-compositor.ts`
- Cause: `includeComposite` flag triggers synchronous Replicate composition. No async queueing.
- Improvement path: Move composition to async background task. Return image ID immediately, queue composition separately. Notify UI via webhook or polling when composite is ready. Update database with composite URL asynchronously.

**Large Type Definition File:**
- Problem: `cocolash-ai/lib/types/index.ts` is 689 lines. All imports pull in all types, increasing bundle size and TypeScript compile time.
- Cause: Centralized type file; no tree-shaking or lazy loading.
- Improvement path: Split by domain (`types/api.ts`, `types/generation.ts`, `types/chat.ts`). Re-export from barrel if needed. Measure TypeScript compile time before and after.

**Unoptimized Database Queries:**
- Problem: No evidence of query optimization (pagination, filtering, indexing guidance) in Supabase calls.
- Files: `cocolash-ai/lib/chat/db.ts`, `cocolash-ai/app/(protected)/gallery/page.tsx`
- Cause: Generic `.select("*")` patterns; no pagination on image galleries.
- Improvement path: Add offset/limit to all list queries. Define indexes on frequently filtered columns (user_id, brand_id, created_at). Add query profiling to identify slow queries.

## Fragile Areas

**Seedance Prompt Generation Chain:**
- Files: `cocolash-ai/lib/seedance/prompt-planner.ts`, `cocolash-ai/lib/ai/director/seedance-director.ts`
- Why fragile: Multi-stage prompt generation with Claude (planner → director → final prompt). Changes to system prompts can cause silent drift in output. No versioning or A/B testing framework.
- Safe modification: All prompt changes must include test cases. Review 5+ generated prompts before deploy. Use Claude with vision to spot-check avatar appearance. Version system prompts in `cocolash-ai/lib/ai/director/system-prompts.ts`.
- Test coverage: Unit tests exist for specific director outputs (product restatement, magnetic frame injection) but no integration tests for full prompt → video path.

**Product Truth Matching Logic:**
- Files: `cocolash-ai/lib/brand/product-truth.ts` (620 lines)
- Why fragile: Core logic for matching products to categoryKey relies on regex patterns and hardcoded product SKUs. If product data changes shape, generation silently falls back to defaults.
- Safe modification: Add logging before fallback. Test with real Shopify product data before deploy. Create fixtures for common product shapes.
- Test coverage: `cocolash-ai/tests/brand/category-key-coverage.test.ts` verifies category keys but not product truth matching completeness.

**HeyGen Avatar Video Generation:**
- Files: `cocolash-ai/lib/heygen/client.ts`, `cocolash-ai/app/api/videos/generate/route.ts`
- Why fragile: Depends on HeyGen availability, quota limits, and voice availability. No fallback to text-to-speech-only mode if HeyGen fails.
- Safe modification: Add feature flag for HeyGen fallback. Test video generation with mocked HeyGen responses. Monitor HeyGen API status.
- Test coverage: No integration tests for video generation pipeline.

**Webhook Deduplication for Seedance:**
- Files: `cocolash-ai/app/api/seedance/webhook/route.ts` (if exists)
- Why fragile: Webhook callbacks from Enhancor.ai must be deduplicated by requestId. If deduplication fails, videos are marked complete multiple times or state corrupts.
- Safe modification: Add transaction-level locking in Supabase. Test webhook replay scenarios (manual request to webhook endpoint twice).
- Test coverage: No webhook deduplication tests found.

## Scaling Limits

**Supabase Concurrent Connection Pool:**
- Current capacity: Depends on plan; Hobby plan has low connection limits.
- Limit: All API routes share a single Supabase client. High-concurrency scenarios (>20 simultaneous requests) will exhaust connection pool.
- Scaling path: Use connection pooling (PgBouncer) or upgrade to Pro plan. Implement request queueing in app layer if still hitting limits.

**Cloudinary Upload Bandwidth:**
- Current capacity: Depends on plan; unclear from code.
- Limit: Video uploads to Cloudinary during publishing are synchronous and unmetered. One large video upload (>1GB) can block entire request.
- Scaling path: Implement chunked uploads. Use Cloudinary API for resumable uploads. Add upload progress tracking.

**Memory Usage in Image Processing:**
- Current capacity: Next.js serverless functions on Vercel have 3GB RAM limit.
- Limit: 4K image generation + Replicate composition in-memory may approach limits. Concurrent requests will OOM.
- Scaling path: Stream large file operations instead of buffering. Use Vercel Blob or S3 for intermediate assets. Monitor memory usage per request.

**Cost Tracking Precision:**
- Current capacity: Cost cap enforced per brand, but estimated costs may drift from actual spend.
- Limit: No reconciliation against actual API spend from OpenRouter, Gemini, HeyGen invoices.
- Scaling path: Set up automated daily reconciliation. Alert when estimated cost diverges >10% from actual. Implement rate limiting before cost cap is hit.

## Dependencies at Risk

**Next.js 16.1.6 - Rapid Release Cadence:**
- Risk: Next.js is in active development; major releases every 3-6 months. Staying current requires vigilance.
- Impact: Breaking changes in App Router, API routes, or middleware. Build failures after `npm update`.
- Migration plan: Monitor Next.js changelog. Test major versions in CI before upgrading production. Use `npm audit` to catch security issues.

**OpenRouter / Claude 3.5 Sonnet Dependency:**
- Risk: OpenRouter is a third-party proxy for Claude. If service goes down, all caption generation and chat endpoints fail.
- Impact: No caption generation, no chatbot responses.
- Migration plan: Build abstraction layer to swap providers (e.g., `lib/llm/provider`). Keep direct OpenAI and Anthropic API keys as fallback. Test failover annually.

**Replicate (Nano Banana Pro) for Image Composition:**
- Risk: Replicate's status is less stable than major clouds. Composition failure cascades to image generation failure.
- Impact: Before-After images cannot be generated.
- Migration plan: Add fallback to simple image concatenation (PIL, Sharp, Cloudinary transform API). Implement graceful degradation (return raw images if composition fails).

**Enhancor.ai / Seedance 2.0:**
- Risk: Enhancor is an emerging service with unclear long-term stability. Full Access endpoint may change or be deprecated.
- Impact: UGC video generation stops working; huge revenue impact.
- Migration plan: Monitor Enhancor roadmap. Keep HeyGen pipeline as fallback. Test alternative UGC services (e.g., Synthesia, D-ID) in sandbox.

## Missing Critical Features

**Async Task Queue for Long-Running Operations:**
- Problem: Image generation, video generation, caption rendering are synchronous. Request timeout (300s) can be exceeded for complex operations.
- Blocks: Cannot reliably generate 4K images, cannot generate >15s videos, cannot compose complex before-after scenes.
- Fix: Implement async task queue (BullMQ, Inngest, or Vercel Crons). Return task ID immediately. User polls for completion or receives webhook.

**Comprehensive API Versioning:**
- Problem: No versioning scheme for API endpoints. Breaking changes in request/response format will break existing clients.
- Blocks: Cannot evolve API without breaking mobile app, widget, or third-party integrations.
- Fix: Implement versioning prefix (`/api/v1/`, `/api/v2/`). Maintain backward compatibility for at least 2 versions. Document deprecation timeline.

**Request/Response Logging & Audit Trail:**
- Problem: Console logs are unsystematic. No centralized audit log for compliance or debugging.
- Blocks: Cannot trace user actions, cannot debug customer issues, cannot audit cost anomalies.
- Fix: Implement structured logging sink (e.g., Axiom, Datadog, CloudWatch). Log all requests, responses, and state changes. Retain for 30+ days.

**A/B Testing Framework for Prompts:**
- Problem: Prompt changes are deployed to 100% of traffic with no gradual rollout or comparison metrics.
- Blocks: Cannot safely experiment with new prompt versions. Cannot measure impact of changes.
- Fix: Integrate feature flag service (LaunchDarkly, Statsig). Create prompt variant experiments. Track quality metrics (user ratings, regeneration rates).

## Test Coverage Gaps

**Incomplete E2E Testing for Video Generation:**
- What's not tested: End-to-end flow from form submission → HeyGen API → video storage → playback. Only component-level and prompt generation tested.
- Files: `cocolash-ai/tests/` contains unit tests but no E2E tests.
- Risk: Regression in video delivery not caught until production. User-facing flows may break silently.
- Priority: High — video generation is core revenue feature.

**No Tests for Webhook Payload Handling:**
- What's not tested: Seedance webhook callbacks, duplicate handling, error scenarios (missing payload, invalid signature).
- Files: No test files found for `cocolash-ai/app/api/seedance/webhook/` or `cocolash-ai/app/api/heygen/webhook/` (if exists).
- Risk: Webhook corruption silently fails; videos marked complete without data. Users see frozen UI.
- Priority: High — webhooks are critical for async pipelines.

**Limited Tests for Chat / Lead Capture:**
- What's not tested: Chat conversation flow, lead email send, rate limiting, cost cap enforcement.
- Files: `cocolash-ai/tests/` contains some chat tests (intent, discount, rate-limit) but no full conversation E2E.
- Risk: Chatbot users can poison KB, exhaust cost cap, or spam leads without being caught.
- Priority: Medium — chat is newer feature but affects customer experience.

**No Stress Tests for Database Concurrency:**
- What's not tested: Multiple simultaneous image generations, video status polling, webhook callbacks under load.
- Files: No load or stress tests found in repo.
- Risk: Database locks, race conditions, or connection pool exhaustion under spike traffic (e.g., viral TikTok campaign).
- Priority: Medium — need to verify scaling assumptions.

---

*Concerns audit: 2026-05-31*
