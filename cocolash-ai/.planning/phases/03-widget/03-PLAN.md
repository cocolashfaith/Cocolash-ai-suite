# Phase 3: Widget v1 — Plan

**Phase:** 03-widget
**Goal:** Ship a Preact + Shadow DOM widget that loads on cocolash.com via `theme.liquid` and consumes the SSE stream from `/api/chat`.
**Depends on:** Phase 2 (route).
**Blocks:** Phase 4 (widget renders product cards), Phase 6 (widget renders try-on).

## Tasks (atomic-commit boundaries)

| # | Task | Files | Commit |
|---|---|---|---|
| 1 | `widget/` Vite + Preact + TS scaffold | `widget/package.json`, `widget/vite.config.ts`, `widget/tsconfig.json`, `widget/index.html` | A |
| 2 | Bundle-size guard | `widget/scripts/check-size.mjs` | A |
| 3 | Add `npm run build:widget` script to root `package.json` | root `package.json` | A |
| 4 | SSE client + chat state hook | `widget/src/lib/sse.ts`, `widget/src/lib/useChat.ts` | B |
| 5 | UI components | `widget/src/components/{Fab,Panel,Header,MessageList,MessageBubble,MessageInput,ConsentStrip,Markdown}.tsx` | C |
| 6 | Brand-styled CSS module | `widget/src/styles/widget.css` | C |
| 7 | Boot script + entrypoint | `widget/src/main.tsx`, `widget/src/App.tsx` | C |
| 8 | Standalone embed snippet for theme.liquid | `public/widget/embed.html` (template/doc) | D |
| 9 | `/api/chat/config` minimal endpoint | `app/api/chat/config/route.ts` | D |
| 10 | Verify: `npm run build:widget` size budget passes | — | E (only if needed) |

## Atomic-commit grouping

- **Commit A** — Vite scaffold + size guard + npm script (1, 2, 3)
- **Commit B** — SSE client + chat hook (4)
- **Commit C** — Components, styles, boot (5, 6, 7)
- **Commit D** — Embed snippet template + config endpoint (8, 9)
- **Commit E** — Verification

## What I CAN'T verify autonomously

- Loading the widget on Faith's actual store (theme.liquid embed) — needs
  the live deploy + Faith's store credentials.
- Cross-browser screenshot pass on Safari/Firefox — manual test step.

## Phase 3 Definition of Done

- `npm run build:widget` produces `public/widget.js` ≤ 50 KB gzipped.
- All Phase 1+2 tests still pass.
- `app/api/chat/config/route.ts` returns `{ greeting, botEnabled }`.
- `public/widget/embed.html` is documented and ready for Faith to paste.

---

*Plan: 2026-05-02 — autonomous execution.*
