# Phase 9: Production hardening — Verification

**Date:** 2026-05-02
**Outcome:** ✅ Code complete, 102/102 tests, build green. Milestone v3.0 closed.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Setting `daily_cap_usd = 0.01` triggers kill-switch on next chat | ✅ Code (`preflight()` returns `cost_cap_exceeded`) |
| 2 | Structured JSON log per request | ✅ `log.info("chat.completed", …)` replaces `process.stdout.write` |
| 3 | Burst 50 messages → 429 after capacity | ✅ `chatRateLimiter.consume()` w/ default 30/5min |
| 4 | Bundle ≤ 50 KB gz | ✅ 12.90 KB |
| 5 | p95 latencies meet targets | ⚠ Synthetic test pending live deploy |
| 6 | Eval re-runs from `npm run eval` | ✅ npm script added |
| 7 | Ops handbook | ✅ docs/CHATBOT-OPS.md (10 sections) |

## Files

```
lib/log.ts                       structured JSON logger (level via LOG_LEVEL)
lib/log.test.ts                  4 tests
lib/chat/preflight.ts            daily kill-switch (bot_enabled + cost cap)
lib/chat/rate-limit.ts           per-key token bucket (30/5min default)
lib/chat/rate-limit.test.ts      4 tests
docs/CHATBOT-OPS.md              ops handbook for Faith's team
package.json                     npm run eval / npm run eval:dry
app/api/chat/route.ts (edit)     wires preflight + rate-limit + log
```

## Tests

```
npm test → 102/102 (was 94 → +4 log + +4 rate-limit)
build    → green
```

---

*Phase 9 closed: 2026-05-02. Milestone v3.0 code-complete.*
