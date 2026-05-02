# Phase 3: Widget v1 + Stage 1 deployment — Context

**Gathered:** 2026-05-02
**Status:** Locked decisions (built on Phase 1+2 outputs).

<domain>
## Phase Boundary

Ship a Preact + Shadow DOM widget that loads on cocolash.com via a
`theme.liquid` snippet, renders the chat UX driven by `/api/chat`, fits
the CocoLash brand identity, and ships within the <50 KB gzipped budget.

Out of this phase: Shopify Storefront product cards (Phase 4), discount
codes (Phase 5), try-on (Phase 6), admin dashboard (Phase 7), Shopify
Custom App + TAE (Phase 8).

**Requirements covered:** CHAT-01 (UI verification), DEPLOY-01, DEPLOY-05,
DEPLOY-06, OPS-04 (cookie consent).

</domain>

<decisions>
## Implementation Decisions

### Build pipeline
- **D-01 — Vite + Preact + TypeScript** in `widget/` directory. Build
  output: a single `widget.js` written into `public/widget.js` so Next.js
  serves it as a static asset on `/widget.js`. Sourcemap (`.js.map`) is
  emitted but only enabled in dev builds.
- **D-02 — Bundle ceiling: 50 KB gzipped.** A small `widget/scripts/check-size.mjs`
  runs after the Vite build and exits non-zero if `gzipSize(public/widget.js)`
  exceeds 50,000 bytes. Wired into `npm run build:widget` so CI fails fast.
- **D-03 — No new top-level scripts on `npm run build`** — that runs the
  Next.js build only. The widget build is a separate `npm run build:widget`.
  Production deploys run both in CI (added in Phase 8 / 9).

### Mount + isolation
- **D-04 — Shadow DOM** on a host element with `id="cocolash-chat-root"`.
  All widget styles are scoped to the shadow tree; no globals. Tailwind
  is NOT used in the widget (it inflates bundle); a small CSS module
  approach with PostCSS suffices.
- **D-05 — Boot script** (~3KB inline) lives in the `theme.liquid` snippet
  and only does: (a) inject the host div, (b) load `widget.js` async,
  (c) pass `window.COCOLASH_CHAT_CONFIG` (shop domain, API base URL).
- **D-06 — Auto-open on first message?** No — opens via the FAB only.
  Avoids ad-style intrusion. The FAB has a small badge after 30s if the
  visitor hasn't opened it (a soft nudge, no autoplay).

### UI shape
- **D-07 — Floating action button (FAB)** bottom-right, 56px, brand color.
  Opens a panel: 380px × 600px on desktop, fullscreen on mobile (<768px).
- **D-08 — Layout:** header (Coco avatar + name + close) → message list
  (scrollable) → typing indicator (during stream) → input (textarea + send).
  Greeting message is rendered locally on first open; subsequent turns
  hit `/api/chat` and stream tokens.
- **D-09 — Streaming UX:** typewriter-like — each delta token appended
  to the assistant bubble; auto-scroll to bottom on new content.
- **D-10 — Markdown:** render assistant messages as light Markdown
  (links + bold + lists only) using a tiny custom parser (~1 KB) — avoids
  pulling `marked` (~30 KB) or `markdown-it` (~50 KB).

### Cookie consent
- **D-11 — Inline strip** above the input on first open of a session.
  Buttons: "OK" / "Decline". Choice persisted in `localStorage` keyed
  by domain. Decline shows a friendly message and disables sending.
- **D-12 — No third-party consent banner** — keeps bundle small and
  doesn't require a CMP integration. Phase 9 may revisit if Faith wants
  a TrustArc/OneTrust integration.

### Brand identity
- **D-13 — Palette** (from `public/brand/cocolash-brand_guidelines (1).pdf`):
  - Primary: warm coffee `#28150e`
  - Beige: `#f5e9d3`
  - Cream: `#faf3e0`
  - Accent: dusty pink `#d4b5a0`
  These are the same colors used by `app/layout.tsx` (`coco-beige`, etc.)
  and `app/(protected)/layout.tsx`. Re-using them via inline CSS variables.
- **D-14 — Typography:** system font stack only — `-apple-system,
  BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. No web fonts in
  the widget (each font is ~30 KB).
- **D-15 — Greeting copy:** locked from `chat_settings.voice_fragments.greeting`.
  Widget calls `GET /api/chat/config` (a lightweight Phase 3 endpoint) on
  load to fetch the current greeting + bot_enabled state.

### Persistence
- **D-16 — localStorage** for: sessionId (UUID), consent decision, and
  last 50 messages (so a refresh doesn't blow the conversation away).
  TTL: 30 days; older entries are evicted on next load.

### Configuration / environments
- **D-17 — `window.COCOLASH_CHAT_CONFIG`** schema:
  ```js
  { apiBaseUrl: string,    // e.g. "https://cocolash-ai.vercel.app"
    shopDomain?: string,   // e.g. "cocolash.myshopify.com"
    customerId?: string }  // populated by App Proxy in Phase 8
  ```
- **D-18 — CORS:** `/api/chat` and `/api/chat/config` set
  `Access-Control-Allow-Origin: <shop domain>` echoed from the request
  Origin (allowlist of `*.cocolash.com` and the `myshopify.com` URL).
  Phase 8 replaces with App Proxy HMAC.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/phases/02-chat-api/02-CONTEXT.md` — SSE protocol contract (D-08, D-09)
- `app/api/chat/route.ts` — server source of truth for the SSE stream
- `public/brand/cocolash-brand_guidelines (1).pdf` — visual identity
- `app/globals.css` + `app/(protected)/layout.tsx` — existing brand CSS variables
- `lib/chat/voice.ts:DEFAULT_VOICE_FRAGMENTS.greeting` — greeting copy

</canonical_refs>

<deferred>
## Deferred Ideas

- Product card rendering (Phase 4 emits `event: products`)
- Try-on flow (Phase 6 emits `event: tryon` + selfie upload)
- App Proxy customer recognition (Phase 8)
- Web push for proactive nudges (out of scope for v3.0)

</deferred>

---

*Phase: 03-widget — Context: 2026-05-02*
