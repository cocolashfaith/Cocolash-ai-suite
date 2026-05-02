# Phase 9: Production hardening — Context

**Phase boundary:** Cost kill-switch, structured logging, rate limiting, performance budgets, ops handoff.

**Reqs:** OPS-01, OPS-02 (verification), CHAT-04 (verification).

## Decisions

- **D-01 — `lib/log.ts`** structured JSON logger (level-controlled by `LOG_LEVEL` env). Replace `process.stdout.write` JSON line in `app/api/chat/route.ts`. New code only — backfilling M1/M2 console.* is *not* in this milestone (CONCERNS.md item carries forward).
- **D-02 — `lib/chat/preflight.ts:checkDailyCap()`** sums `chat_cost_events.total_cost_usd` for the current UTC day; throws `ChatError(503, 'cost_cap_exceeded')` when ≥ `chat_settings.daily_cap_usd`. Called at the top of `/api/chat`, `/api/chat/tryon`, and the embedding path in `/api/chatbot/admin/content`.
- **D-03 — Rate limit:** simple in-memory token-bucket per `sessionId` (or per IP fallback) — 30 messages / 5 minutes. `lib/chat/rate-limit.ts` exposes `consume(key)` returning `{ allowed, remaining }`. Per-process — same as `lib/shopify/cache.ts`.
- **D-04 — Performance budgets:** documented in `docs/CHATBOT-OPS.md` and asserted in CI by the existing widget bundle-size check (already in place).
- **D-05 — Ops doc:** new `docs/CHATBOT-OPS.md` covers admin login, content re-index, transcript review, cost-cap recovery, kill-switch, common failures.
- **D-06 — Eval CI gate:** add `npm run eval` script that runs `scripts/chat-eval.ts` with no-flag (full run) — the gating thresholds are already in code. Documented; not wired into a CI workflow file (out of scope).

## Files

```
lib/log.ts
lib/log.test.ts
lib/chat/preflight.ts
lib/chat/preflight.test.ts
lib/chat/rate-limit.ts
lib/chat/rate-limit.test.ts
app/api/chat/route.ts (edit: replace stdout JSON with log.info; consume rate limit; preflight)
docs/CHATBOT-OPS.md
package.json (npm run eval)
```

---

*Phase 9: 2026-05-02 — final phase of milestone v3.0.*
