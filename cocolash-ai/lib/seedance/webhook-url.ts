/**
 * The public Enhancor callback URL — shared by BOTH engines.
 *
 * Seedance 2.0 (lib/seedance/client.ts) and Seedance 2.5 (lib/seedance/v25/client.ts)
 * post to the same public route `/api/seedance/webhook`, which is already in the
 * middleware allow-list. The shared secret travels as `?token=` so Enhancor
 * (which cannot set custom headers) can authenticate.
 *
 * SECURITY: the returned string carries ENHANCOR_WEBHOOK_SECRET. Never log it,
 * never persist it — `request_payload` on `generated_videos` stores the
 * normalized request WITHOUT `webhook_url` on purpose.
 *
 * Moved verbatim out of app/api/seedance/generate/route.ts (Wave 1, package A).
 */
export function getEnhancorWebhookUrl(): string {
  const configuredUrl = process.env.ENHANCOR_WEBHOOK_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl && !appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is required to build the Enhancor webhook URL");
  }

  const webhookUrl = configuredUrl ?? `${appUrl!.replace(/\/$/, "")}/api/seedance/webhook`;
  const secret = process.env.ENHANCOR_WEBHOOK_SECRET;

  if (!secret) {
    return webhookUrl;
  }

  const url = new URL(webhookUrl);
  url.searchParams.set("token", secret);
  return url.toString();
}
