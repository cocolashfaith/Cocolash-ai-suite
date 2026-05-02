# Phase 3: Widget v1 — Verification Report

**Verified by:** Claude (autonomous)
**Date:** 2026-05-02

## Outcome

✅ Widget builds at **10.78 KB gzipped** (budget 50 KB).
✅ Next.js build green (`/api/chat`, `/api/chat/config` registered).
✅ All 47 unit tests still passing.
⚠ Live verification on Faith's actual store requires the Stage 1 deploy.

## Success criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Embed snippet renders fully styled widget without theme CSS leakage | ✅ Code | Shadow DOM mount in `widget/src/main.tsx`; CSS scoped to `:host` |
| 2 | `widget.js` bundle size ≤ 50KB gzipped (CI check) | ✅ | 10.78 KB / 50 KB; check-size.mjs exit-1 above budget |
| 3 | Renders correctly on iOS Safari, Chrome Android, desktop browsers | ⚠ Manual | System fonts, standard CSS — no browser-specific APIs used. Manual screenshot pass needed |
| 4 | Streaming chat plays smoothly | ✅ Code | SSE client (`widget/src/lib/sse.ts`) + auto-scroll on new content |
| 5 | Cookie banner persists in localStorage | ✅ Code | `usePersistedState` 30-day TTL |
| 6 | Faith's actual cocolash.com hosts the widget without breaking theme | ⚠ Pending Stage 1 deploy | Snippet at `public/widget/embed.html` |

## Tests + builds

```
npm test                  → 47/47 pass
npm run build             → green; /api/chat + /api/chat/config registered
npm run build:widget      → 10.78 KB gzipped (budget 50 KB)
widget tsc --noEmit       → clean (after vite-env.d.ts shim for *.css?inline)
```

## Files added

```
widget/
├── package.json, package-lock.json
├── tsconfig.json
├── vite.config.ts
├── scripts/check-size.mjs
└── src/
    ├── main.tsx              boot + Shadow DOM mount
    ├── App.tsx               FAB ↔ panel state, config fetch, kill-switch
    ├── vite-env.d.ts
    ├── components/
    │   ├── Fab.tsx
    │   ├── Header.tsx
    │   ├── MessageList.tsx
    │   ├── MessageInput.tsx
    │   ├── ConsentStrip.tsx
    │   └── Markdown.tsx
    ├── lib/
    │   ├── sse.ts            POST-capable SSE client
    │   ├── state.ts          localStorage + usePersistedState hook
    │   ├── useChat.ts        high-level send() + stream wiring
    │   └── markdown.ts       safe Markdown subset (~2KB)
    └── styles/widget.css     :host-scoped, brand palette

app/api/chat/config/route.ts  GET widget bootstrap config + CORS
public/widget/embed.html      theme.liquid embed snippet for Faith

tsconfig.json                 widget/ excluded from Next.js TS scope
```

## Atomic commits

```
73e47f0 docs: phase 3 context + plan
df8edad feat(widget): Vite + Preact + TS scaffold + 50KB size guard
2ee14e1 feat(widget): SSE client + persisted chat state hook
f400587 feat(widget): UI components + brand-styled CSS + boot script
9be38c3 feat(chat): /api/chat/config endpoint + theme.liquid embed snippet
(this) — verification + STATE.md update
```

## What the user must do for Stage 1 live

1. Build the widget (CI runs this automatically; locally `npm run build:widget`).
2. Deploy the Next.js app — the same build serves `/widget.js` and the `/api/chat*` routes.
3. Replace `API_BASE_URL` in `public/widget/embed.html` with the production URL.
4. Paste the snippet into Faith's `theme.liquid` just before `</body>`.
5. Open cocolash.com and verify the chat FAB appears bottom-right.

---

*Phase 3 closed: 2026-05-02. Proceeding to Phase 4 (Shopify Storefront integration).*
