# CocoLash AI Sales Assistant — Ops handbook

For Faith's team. Day-to-day operation of Coco — the AI Sales Assistant on cocolash.com.

---

## Table of contents

1. Logging in to the admin
2. Toggling the bot on/off
3. Editing brand voice fragments
4. Updating the knowledge base
5. Managing discount codes
6. Reviewing transcripts and leads
7. Reading analytics
8. Cost cap and kill-switch
9. Try-on flow
10. When something breaks

---

## 1. Logging in to the admin

Go to **`https://<deployed-app>/chatbot/admin`**. The admin lives inside the existing CocoLash AI Studio app, so use the same Supabase login.

Faith is granted access automatically (her email matches the `ADMIN_EMAIL` constant). Other team members are added by inserting a row into `chat_admin_users`:

```sql
INSERT INTO chat_admin_users (auth_user_id, email, role)
VALUES ((select id from auth.users where email = 'NAME@cocolash.com'), 'NAME@cocolash.com', 'team');
```

---

## 2. Toggling the bot on/off

**Settings → "Bot enabled"** is the global kill switch. When off, Coco responds with a friendly "we're updating, check back soon" 503. The kill switch:

- Is also flipped automatically by the daily cost-cap (§8).
- Takes effect on the next chat request — Faith doesn't need to redeploy.

---

## 3. Editing brand voice fragments

**Voice** page. Each fragment is editable inline:

| Fragment | When Coco uses it |
|---|---|
| `persona_name` | Coco's name; appears in the header + system prompt |
| `greeting` | First message the visitor sees in the panel |
| `recommend_intro` | Opener when starting a product recommendation |
| `escalation` | Hand-off message to support@cocolash.com |
| `after_hours_suffix` | Appended to escalation outside Mon–Fri 9–5 EST |
| `lead_capture` | Invites the visitor to drop their email |
| `tryon_offer` | Use `{product}` placeholder for the style name |
| `dont_know` | Fallback when Coco can't find an answer |

**You cannot edit Coco's locked rules** (no urgency tactics, no medical claims, no inventing codes, etc.) from this page. Those live in code (`lib/chat/voice-rules.ts`) and are protected by an automated test.

---

## 4. Updating the knowledge base

**Knowledge** page.

- **Upload a new doc** (`.md`/`.txt`/`.csv`) or paste text inline. New chunks land at tier 2 (`admin_upload`) — overrideable by the curated System 3 KB at tier 1.
- **Delete** a chunk you uploaded by hitting Delete in its row. Pre-ingested KB chunks (FAQ, product catalog, voice doc) are read-only.
- **Re-ingest the System 3 KB** when Faith updates her FAQ or product catalog: from the repo,

  ```bash
  npx tsx scripts/chat-ingest.ts
  ```

  Idempotent; only re-embeds chunks whose content changed.

---

## 5. Managing discount codes

**Discounts** page lists every rule. Edit a rule:

- **Status:** `active` / `paused` / `expired`. Coco only ever offers `active` codes within their `campaign_window`.
- **Intent triggers:** comma-separated list (e.g. `lead_capture, product`). Empty = applies to any intent.
- **Product handles (scope):** comma-separated handles (e.g. `violet, dahlia`). Empty = any product.

To bulk-import the latest CSV from Shopify:

```bash
npx tsx scripts/discount-import.ts
```

---

## 6. Reviewing transcripts and leads

**Transcripts** lists the last 100 sessions. Click into any session to see the full conversation, including intent labels and try-on results.

**Leads** lists captured emails. The **Export CSV** button downloads the last 1000 leads; query strings `?from=YYYY-MM-DD&to=YYYY-MM-DD` filter by date.

---

## 7. Reading analytics

**Analytics** page — 30-day window:

- Sessions, user messages, average messages-per-session
- Lead captures, try-ons
- Intent breakdown (product / tryon / order / support / lead_capture / other)
- Spend by pipeline (chat_completion / intent_classify / embedding / tryon_compose)

---

## 8. Cost cap and kill-switch

**Settings → Daily cap (USD)** sets the daily ceiling. When today's spend hits the cap, Coco's preflight check (`lib/chat/preflight.ts`) automatically returns a 503 to all subsequent chat requests until UTC midnight.

The cap is per-day (UTC). Edit it any time; takes effect immediately.

To **manually pause** without touching the cap, use the bot enabled toggle.

---

## 9. Try-on flow

When a visitor says "show me on me" or clicks "✨ See it on you" on a product card, Coco:

1. Asks for consent ("we keep your photo for 24 hours then delete it").
2. Uploads the selfie to a private Supabase bucket with `expires_at = now + 24h`.
3. Calls `composePersonWithProduct` (the same Gemini composition used by the M2 video pipeline).
4. Renders the result inline.

**Selfies older than 24h are purged automatically** by a cron — but the metadata row stays so the admin can audit the upload.

If a try-on fails, the visitor sees "That didn't work — try again". The error reaches `process.stderr` via `lib/log.ts` for debugging.

---

## 10. When something breaks

| Symptom | Where to look |
|---|---|
| Widget doesn't load | Check `<deployed-app>/widget.js` returns 200; check `theme.liquid` snippet is intact OR the TAE is enabled |
| Chat returns 503 | Settings page — bot enabled? Check daily spend vs cap |
| Bot recommends wrong style | Knowledge page — was a contradicting `admin_upload` chunk added? |
| Bot offers expired code | Discounts page — rule's `campaign_window` expired but status still `active`? |
| Lead emails not arriving | Check `RESEND_API_KEY` / `LEAD_EMAIL_FROM` set; check Resend dashboard for delivery logs |
| Try-on stuck / fails | Check `GEMINI_API_KEY` set; check `chat-selfies` bucket exists and is private |
| Admin login redirects to `/login` | User isn't in `chat_admin_users` — add a row |

---

*Last updated: 2026-05-02. Phase 9 of milestone v3.0.*
