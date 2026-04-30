# Concerns, Tech Debt & Fragile Areas

**Analysis Date:** 2026-05-01

> **Read me first.** This document is a snapshot of *unresolved* concerns surfaced from a static read of the codebase as of 2026-05-01 (head: `6ae2f1c — Seedance Pipeline Tested`). Items are grouped by category and ranked by severity within each. Severity is the orchestrator's judgment based on blast radius if the concern were exploited or hit in production — not an audit, not a guarantee. Verify before acting.

## Severity Legend

- **HIGH** — exploitable today, or causes data loss / cross-tenant leakage / production outage if hit.
- **MEDIUM** — degrades reliability, observability, or maintainability; not directly exploitable but a foot-gun.
- **LOW** — code smell or future-proofing; ignore unless you are already in the file.

---

## 1. Security

### HIGH — `generated_videos` is not user-scoped

**Evidence:**

- `supabase/migrations/20260321_upgrade_one_system_two.sql` creates `generated_videos` with no `user_id`/`brand_id` column. None of the later migrations (`20260408_seedance_columns.sql`, `20260421_*`, `20260429_*`) add ownership.
- `app/api/videos/route.ts:19` lists videos with `createAdminClient()` and no filter beyond `status` / `pipeline`.
- Compare `app/api/images/route.ts:30-40` — images are scoped via `getCurrentUserId(supabase)` + `query.eq("user_id", userId)`.

**Why it matters:** A logged-in user (legacy cookie or Supabase) hitting `GET /api/videos` receives every other user's videos, including HeyGen and Seedance outputs and their associated script text and product image URLs.

**Suggested fix:** Add `user_id UUID REFERENCES auth.users(id)` to `generated_videos` (backfill if needed), set it on insert in `app/api/videos/generate/route.ts` and `app/api/seedance/generate/route.ts`, and filter in `app/api/videos/route.ts` and `app/api/seedance/[id]/status/route.ts`.

### HIGH — No Postgres RLS policies anywhere

**Evidence:** `grep -in "row level security\|create policy\|alter table.*enable" supabase/migrations/*.sql` returns 0 matches. No migration enables RLS or adds policies on `generated_images`, `generated_videos`, `video_scripts`, `captions`, `scheduled_posts`, `social_accounts`, `caption_settings`, `hashtags`, etc.

**Why it matters:** App-level scoping is the only protection. Any direct DB access (Supabase Dashboard, leaked anon key, future client-side query) is unprotected. If anyone ever calls `supabase.from('generated_videos').select('*')` from the browser using the anon key, every row is readable.

**Suggested fix:** Add RLS policies in a new migration. At minimum: `ENABLE ROW LEVEL SECURITY` on every user-owned table and a `using (auth.uid() = user_id)` policy. Audit each route that uses `createAdminClient` to confirm whether the bypass is intentional.

### HIGH — Service role used in user-facing list/status endpoints

**Evidence (selected):**

- `app/api/videos/route.ts:2,19` — `createAdminClient()` for list.
- `app/api/videos/[id]/route.ts`, `app/api/videos/[id]/status/route.ts`, `app/api/videos/[id]/caption/route.ts`, `app/api/videos/[id]/download/route.ts` — all use `createAdminClient`.
- `app/api/scripts/route.ts:2`, `app/api/backgrounds/route.ts:2,20` — same pattern.

**Why it matters:** Routes using the service-role key bypass any future RLS and currently bypass app-level user filtering (combined with the previous concern, this is how cross-tenant leakage happens). The pattern was likely adopted to dodge missing RLS but should be inverted: use `createClient()` and rely on RLS, reserve `createAdminClient` for genuinely privileged operations (storage uploads, webhooks, admin endpoints).

### MEDIUM — Webhook secret accepted via URL query parameter

**Evidence:** `app/api/seedance/webhook/route.ts` (function `isAuthorizedWebhook`):

```ts
const incoming =
  request.headers.get("x-webhook-secret") ??
  request.nextUrl.searchParams.get("token") ??
  "";
```

**Why it matters:** Query strings end up in proxy access logs, browser history (if ever loaded interactively), and CDN caches. The `timingSafeEqual` comparison (`safeCompare`) is correct, but the secret being in the URL undermines the protection.

**Suggested fix:** Drop the `searchParams.get("token")` fallback. If Enhancor cannot send custom headers, switch to HMAC of the body (`x-webhook-signature`) instead of a shared secret.

### MEDIUM — `getCurrentUserId(supabase)` returns `null` for legacy-cookie sessions; image listing then unfilters

**Evidence:** `app/api/images/route.ts:30`:

```ts
const userId = await getCurrentUserId(supabase);
let query = supabase.from("generated_images").select("*", { count: "exact" });
if (userId) {
  query = query.eq("user_id", userId);
}
```

**Why it matters:** Users authenticated via the legacy `cocolash-auth` cookie (`middleware.ts:24`) are recognised by middleware but `supabase.auth.getUser()` returns `null`, so the `user_id` filter is silently skipped — they see every image. This was probably intentional during M1–M2 (single-user mode) but is a sharp edge as Supabase Auth rolls out.

**Suggested fix:** Either reject the request if `userId` is null, or treat the legacy cookie as a fixed-uuid pseudo-user and filter by it. Make the choice explicit; don't leave it as a silent bypass.

### MEDIUM — No SSRF validation on user-provided URLs

**Evidence:** `app/api/seedance/generate/route.ts` (and the HeyGen variant) accept `personImageUrl`, `productImageUrl`, `audioUrl`, `firstFrameImage`, `lastFrameImage`, `lipsyncingAudio` from request bodies and forward them to Enhancor / HeyGen / Gemini without scheme/host validation.

**Why it matters:** Although the URLs are forwarded outbound (not fetched server-side directly in most paths), helpers like `composePersonWithProduct` and the gallery downloaders do fetch URLs server-side. If any of those are reachable via internal network ranges (`169.254.169.254`, `127.0.0.1`, RFC1918), the attacker can pivot to internal services.

**Suggested fix:** Add a `lib/security/url.ts` helper that validates `https://` only, public DNS, and an allowlist of known hosts (`*.supabase.co`, `res.cloudinary.com`, `**.heygen.ai`). Reuse it everywhere a URL crosses the trust boundary.

### MEDIUM — Single-user admin model

**Evidence:** `app/api/admin/users/route.ts:6,17`:

```ts
const ADMIN_EMAIL = "admin@cocolash.com";
...
return user.email === ADMIN_EMAIL || user.user_metadata?.role === "admin";
```

**Why it matters:** Admin access is hard-coded by email. Rotating the admin requires a code change. Also, `user_metadata` is user-writable in Supabase by default — if `auth.users.user_metadata` is ever updated via a non-admin path that allows `role`, anyone can self-promote.

**Suggested fix:** Move the admin list to a server-only env var (`ADMIN_EMAILS`) or to a dedicated `app_admins` table read with the service role. If using `user_metadata`, switch to `app_metadata` (which is service-role-write only).

### LOW — Non-null assertion on env vars (`process.env.X!`)

**Evidence:** 11+ call sites: `lib/supabase/{server,client,middleware}.ts`, `app/api/admin/users/route.ts`, etc.

**Why it matters:** A missing env var produces a misleading runtime error (e.g. "Invalid URL" deep inside `@supabase/ssr`) instead of a clear startup failure.

**Suggested fix:** Add a single `lib/env.ts` that validates required vars at module load and throws a named error. Re-export typed strings from there.

---

## 2. Reliability & Correctness

### MEDIUM — 184 `console.{log,warn,error}` calls in production paths

**Evidence:** `grep -rn "console\." app/ lib/` returns 184 hits. Concentrated in `app/api/generate/route.ts` (~25 in one file), `app/api/videos/[id]/status/route.ts`, `app/api/seedance/webhook/route.ts`, and across `lib/`.

**Why it matters:** Vercel's log retention and ingestion are billed and rate-limited. Verbose JSON-stringified payloads in hot paths blow through the budget and bury real errors. There is no log-level filter.

**Suggested fix:** Introduce `lib/log.ts` with `info`/`warn`/`error` and a `LOG_LEVEL` env knob (default `warn` in prod, `info` in dev). Replace `console.log` with `log.info`. Keep `console.error` only for unexpected exceptions.

### MEDIUM — Webhook idempotency depends on a single DB lookup, no advisory lock

**Evidence:** `app/api/seedance/webhook/route.ts` (post-snippet read): the handler queries `generated_videos` by `seedance_task_id`, branches on `payload.status`, and updates the row. There is no row-level lock or `ON CONFLICT` guard.

**Why it matters:** Enhancor explicitly says it can send duplicates. If two webhook deliveries land within milliseconds (different Vercel instances), both can read the same "pending" row and both can run `completeSeedanceVideo` — duplicate uploads, duplicate cost-tracker entries, and a possible second status flip.

**Suggested fix:** Either (a) add a `processed_webhooks` table with a unique constraint on `(provider, request_id)` and `INSERT ... ON CONFLICT DO NOTHING` before processing, or (b) wrap the processing in a `SELECT ... FOR UPDATE` inside a transaction, or (c) require `status = 'pending'` in the `UPDATE` predicate so a second writer becomes a no-op.

### MEDIUM — HeyGen client lacks exponential-backoff retry

**Evidence:** `lib/heygen/client.ts` (file header advertises retry on 500/503; check the implementation before relying on this).

**Why it matters:** HeyGen is the slowest dependency (`maxDuration = 300` is set because of it). A flat retry can stampede during their incidents, especially with long timeouts.

**Suggested fix:** Adopt an exponential-backoff helper (e.g. mirror what `lib/seedance/client.ts` does, or factor a shared `lib/http/retry.ts`).

### LOW — `app/(protected)/settings/page.tsx:65` swallows errors with `.catch(() => {})`

**Why it matters:** Silent failure mode in a settings page — a user can't tell whether their change saved.

**Suggested fix:** Surface the failure via a `sonner` toast.

---

## 3. Observability & Cost

### MEDIUM — No cost forecasting before generation

**Evidence:** `lib/costs/{tracker.ts,estimates.ts}` and `app/api/costs/route.ts` provide a *post-hoc* monthly summary. Nothing in `app/api/generate/route.ts`, `app/api/videos/generate/route.ts`, or `app/api/seedance/generate/route.ts` checks a budget before calling the paid API.

**Why it matters:** A misclick (e.g. 4K Before/After at 90s Seedance) can spend tens of dollars. There is no soft cap.

**Suggested fix:** Add a `lib/costs/preflight.ts:estimateAndCheck(ctx)` that throws if the projected month-to-date would exceed `process.env.MONTHLY_COST_CAP_USD`.

### MEDIUM — No structured request IDs / tracing

**Evidence:** Logs are prefixed with `[Generate]`, `[seedance/webhook]`, etc. but there is no per-request correlation ID. Multi-step pipelines (script → compose → upload → record) cannot be reconstructed across log lines.

**Suggested fix:** Generate a UUID at the top of each route handler, prefix all log lines with it, and return it in the response (or `x-request-id` header) so the UI can include it in error reports.

### LOW — `/api/costs` is unauthenticated by app code

**Evidence:** `app/api/costs/route.ts` reads via `getMonthlyCostSummary` and returns the summary. No auth/admin check at the route level — relies entirely on the middleware gate.

**Why it matters:** Any authenticated user (including legacy-cookie users) can see the org-wide spend.

**Suggested fix:** Wrap with the `isAdmin()` check used in `app/api/admin/users/route.ts`.

---

## 4. Performance & Scale

### MEDIUM — `app/api/videos/route.ts` returns up to 100 rows of full `select("*")` with `count: "exact"`

**Evidence:** `app/api/videos/route.ts:14-22` — `limit` capped at 100; `select("*", { count: "exact" })` runs an aggregate scan.

**Why it matters:** `count: "exact"` forces a full table scan on every list — this gets quadratic as the table grows, regardless of `range()` pagination. Returning every column inflates the payload (Seedance prompt text + script_text_cache can each be multi-KB).

**Suggested fix:** Use `count: "estimated"` for the dashboard, or drop the count and rely on `hasMore` heuristics. Project only the columns the gallery needs (`select("id, pipeline, heygen_status, video_url, ...")`).

### MEDIUM — Image composition is on the critical path of every video

**Evidence:** `app/api/videos/generate/route.ts` (header step 3) and `app/api/seedance/generate/route.ts` both call `composePersonWithProduct` (Gemini) inline. If Gemini is slow, the entire request waits.

**Why it matters:** Adds avoidable latency and a hard failure point. Could be an async pre-step (`/api/seedance/generate-ugc-image` already exists) and the composed URL passed in.

**Suggested fix:** Standardise on the two-step flow — compose image first, then call `/generate` with the resulting `composedImageUrl`. The HeyGen route already accepts `composedImageUrl` (`body.composedImageUrl`).

### LOW — No connection pooling / keep-alive for outbound fetches

**Evidence:** Every external client (`lib/gemini`, `lib/heygen`, `lib/seedance`, `lib/elevenlabs`, `lib/openrouter`) uses `fetch` directly with no shared agent.

**Why it matters:** Vercel's serverless functions cold-start with fresh sockets per invocation; cross-invocation pooling isn't possible. Within a single invocation that makes multiple calls (script → compose → submit), HTTP/2 keep-alive *would* help.

**Suggested fix:** Low priority. Consider `undici.Agent({ keepAliveTimeout, pipelining })` if profiling shows TCP setup is a hot cost.

---

## 5. Maintainability

### MEDIUM — Multiple files >500 lines are doing too much

**Evidence (`wc -l`):**

| File | Lines | Likely overload |
| --- | --- | --- |
| `components/video/AvatarSetup.tsx` | 1406 | Form + upload + preview + state machine |
| `components/video/seedance/SeedanceGenerateStep.tsx` | 963 | Wizard step + inline validation + submission |
| `components/settings/HashtagManager.tsx` | 807 | CRUD + import + filtering |
| `app/api/generate/route.ts` | 785 | Validation + branch logic + Before/After path |
| `components/video/ScriptGenerator.tsx` | 770 | Script builder + variations + library picker |
| `lib/types/index.ts` | 689 | Central type registry — expected, but breaking up by domain would help |
| `components/video/seedance/SeedanceScriptStep.tsx` | 664 | |
| `components/video/seedance/SeedanceAvatarStep.tsx` | 658 | |
| `components/generate/PublishModal.tsx` | 578 | |
| `components/video/VoiceAndStyle.tsx` | 567 | |
| `app/api/seedance/generate/route.ts` | 534 | Validation + mode-by-mode branching |
| `app/(protected)/video/page.tsx` | 506 | HeyGen + Seedance wizard orchestration |

**Why it matters:** These are the files where regressions concentrate. Reading them top-to-bottom takes minutes; AI-assisted edits risk shadowing existing logic.

**Suggested fix:** Don't refactor speculatively. Next time you touch one, peel off the cleanest sub-concern (a validator, a helper component, a mode-specific branch) into its own file. `app/api/seedance/generate/route.ts` in particular would benefit from splitting per-mode handlers.

### LOW — `lib/seedance/ugc-image-prompt.test-examples.ts` is shipped in the build

**Evidence:** File exists under `lib/`. It contains sample inputs for development. There is no `.test.ts` suffix exclusion in `tsconfig.json`.

**Why it matters:** Test fixtures shipped to production add bundle weight (small in this case but easy to compound). Also, if it ever imports a real client, secrets-bearing code paths can leak.

**Suggested fix:** Move to `scripts/` or `__fixtures__/` and exclude in `tsconfig.json`.

### LOW — Dual-auth strategy is meant to be temporary

**Evidence:** `middleware.ts:6-13` documents it as transitional ("M3 upgrade").

**Why it matters:** Every concern in §1 is harder to fix while two auth paths must keep working. The longer the dual-auth stays, the more `getCurrentUserId(supabase)` returning `null` propagates through new routes.

**Suggested fix:** Schedule the cookie deprecation. Track which users still rely on it; once empty, remove the legacy branch.

---

## 6. Testing

> See `TESTING.md` for the full picture. The headline is: **there is no formal test framework**. Files in `scripts/` named `test-*.ts` are ad-hoc smoke tests run manually with `tsx`. There are no fixtures, no CI test step, and no coverage measurement.

This means every concern above must be validated by hand (or by adding tests as part of the fix). High-priority candidates for first tests:

1. Webhook idempotency under duplicate delivery.
2. Auth scoping — `GET /api/videos` should not return another user's rows.
3. RLS once added — direct DB queries with the anon key should be denied.
4. SSRF — `composePersonWithProduct` should reject internal hosts.
5. Cost preflight — the cap should fire before the Gemini call.

---

## Summary

| Theme | Top item to address |
| --- | --- |
| Tenant isolation | Add `user_id` to `generated_videos`; filter in routes; enable RLS. |
| Webhook safety | Drop URL-token fallback; add idempotency table for `request_id`. |
| Cost safety | Preflight cost check on `/generate`, `/videos/generate`, `/seedance/generate`. |
| Observability | Replace `console.*` with a leveled logger; add request IDs. |
| Code maintainability | Stop adding to the >700-line components/routes; split per concern next time you touch them. |

---

*Concerns analysis: 2026-05-01. Verify each finding at the cited file:line before acting on it.*
