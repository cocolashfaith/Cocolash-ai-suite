# Shopify deployment guide — CocoLash AI Sales Assistant

This is the runbook for moving CocoLash AI Chat from Stage 1 (`theme.liquid` snippet) to Stage 2 (Shopify Custom App + Theme App Extension + App Proxy).

## Stage 1 — `theme.liquid` snippet (already documented)

See `public/widget/embed.html`. Paste before `</body>` in Faith's `theme.liquid`. Done.

## Stage 2 — one-click install + signed customer-aware traffic

### 1. Create the Shopify Partner account

- Sign up at <https://partners.shopify.com/signup> (free, ~5 min).
- Add Faith's store as a managed store.

### 2. Create a Custom App

- In the Partner dashboard: **Apps → Create app → Custom app**.
- Name: **CocoLash AI Assistant**.
- App URL: `https://<your-deployed-vercel-app>` (the Next.js deployment).
- Allowed redirect URL: `https://<your-deployed-vercel-app>/api/shopify/auth/callback` *(only needed if we add OAuth in v3.1; not used in this milestone).*

### 3. Configure App Proxy

In the app's **App Setup → App Proxy** section:

- **Subpath prefix:** `apps`
- **Subpath:** `cocolash-chat`
- **Proxy URL:** `https://<your-deployed-vercel-app>/api/shopify/proxy`

This makes Shopify forward `https://cocolash.com/apps/cocolash-chat/<path>` to `https://<deployed>/api/shopify/proxy/<path>` with the standard signed query string.

### 4. Capture the App's API secret

- In **App Setup → Secrets**, copy the API secret (`shpss_…`).
- Set it in Vercel + `.env.local`:
  ```
  SHOPIFY_APP_API_KEY=<api key>
  SHOPIFY_APP_API_SECRET=<api secret>
  ```
- The App Proxy HMAC verifier in `lib/shopify/app-proxy-hmac.ts` reads `SHOPIFY_APP_API_SECRET`.

### 5. Push the Theme App Extension

The extension lives in `extensions/cocolash-chat-block/`.

```bash
# From the repo root, install Shopify CLI if you haven't:
npm install -g @shopify/cli @shopify/theme

# Log in to your Partner account:
shopify login

# Push the extension to your app:
shopify app deploy
```

Once deployed, Faith can enable it in **Online Store → Themes → Customize → App embeds → CocoLash AI Chat → toggle on → Save**.

### 6. Cutover

1. Verify Stage 2 is working in a private theme preview (the TAE supports this).
2. Once happy, **remove** the Stage 1 `theme.liquid` snippet (otherwise the widget mounts twice).
3. Re-publish the theme.

### 7. Customer recognition

The App Proxy automatically appends `logged_in_customer_id=<id>` to forwarded requests when a customer is logged into Shopify. Our proxy route extracts it and passes through as `customerId` in the chat body. The widget greeting will then include the customer's first name (Phase 8 wires this; Phase 4's customer-context system prompt branch already handles it).

### 8. Rollback

If something goes wrong with Stage 2:
1. Disable the TAE in App embeds.
2. Re-paste the Stage 1 snippet into `theme.liquid`.
3. The widget keeps working since `/widget.js` and the chat API are unchanged.

---

## Webhook configuration (Phase 4)

In Shopify Admin → Settings → Notifications → Webhooks, create three webhooks pointing to `https://<deployed>/api/shopify/products-webhook` with the `SHOPIFY_WEBHOOK_SECRET` shared secret:

- `products/create`
- `products/update`
- `products/delete`

Test by editing a product in the admin; within 5s the chunk should appear/update in `knowledge_chunks`.

---

*Last updated: 2026-05-02.*
