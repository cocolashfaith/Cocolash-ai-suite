/**
 * lib/chat/notify.ts — Emails to the support inbox: captured leads and
 * "Coco needs a human" handoffs (see lib/chat/handoff.ts for when each fires).
 *
 * Sends to CHATBOT_SUPPORT_EMAIL via Resend when RESEND_API_KEY is set.
 * Falls back to a console log when LEAD_EMAIL_DRY_RUN is "true" or no key —
 * reported as via "dry_run"/"skipped", never as "resend", so callers and logs
 * can tell a real send from a no-op.
 *
 * No external SDK — Resend's API is a simple POST so we use fetch and avoid
 * a 200KB SDK dep. Keeps the bundle clean.
 */

export interface LeadEmailInput {
  to: string;
  fromName: string;
  fromEmail: string;
  email: string;
  intent: string | null;
  discountOffered: string | null;
  transcriptLink: string;
  notes: string | null;
  /** Resend Idempotency-Key for this logical notification (see sendViaResend). */
  idempotencyKey?: string;
}

export interface NotifyResult {
  ok: boolean;
  via: "resend" | "dry_run" | "skipped";
  error?: string;
  /**
   * Resend answered with a definitive rejection (a 4xx other than 409 or 429)
   * and no earlier attempt in this call is unconfirmed, so nothing was sent.
   * Unset when the outcome is unconfirmed — network error, timeout, 429, 5xx,
   * or a 409 (the key is still in flight, or was already used) — and Resend
   * may have accepted it.
   */
  rejected?: boolean;
}

export interface HandoffEmailInput {
  to: string;
  fromName: string;
  fromEmail: string;
  /** What the customer said that led Coco to hand off (the stored reason). */
  customerMessage: string;
  /** The customer's email if they shared one in this session. */
  customerEmail: string | null;
  transcriptLink: string;
  /** Resend Idempotency-Key for this logical notification (see sendViaResend). */
  idempotencyKey?: string;
}

export async function sendLeadEmail(input: LeadEmailInput): Promise<NotifyResult> {
  return sendViaResend({
    to: input.to,
    from: `${input.fromName} <${input.fromEmail}>`,
    subject: `New CocoLash lead: ${input.email}`,
    html: renderHtml(input),
    text: renderText(input),
    logLine: `lead ${input.email} (intent: ${input.intent ?? "?"}, discount: ${input.discountOffered ?? "none"})`,
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * "Coco needs a human" — sent when Coco hands a customer off to the team
 * (complaints, refunds, custom orders, anything outside what she can answer).
 */
export async function sendHandoffEmail(input: HandoffEmailInput): Promise<NotifyResult> {
  const snippet = input.customerMessage.replace(/\s+/g, " ").trim();
  const short = snippet.length > 60 ? `${snippet.slice(0, 57)}…` : snippet;
  return sendViaResend({
    to: input.to,
    from: `${input.fromName} <${input.fromEmail}>`,
    subject: `Coco needs a human: "${short}"`,
    html: renderHandoffHtml(input),
    text: renderHandoffText(input),
    logLine: `handoff (customer email: ${input.customerEmail ?? "not shared"})`,
    idempotencyKey: input.idempotencyKey,
  });
}

async function sendViaResend(msg: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  logLine: string;
  /**
   * Sent as Resend's Idempotency-Key and reused, with the identical payload,
   * across the in-process retry — so if Resend accepted the first request but
   * its response was lost, the retry is deduplicated instead of re-delivered.
   * Callers keep the key (and payload) across later retries too; see
   * lib/chat/handoff.ts.
   */
  idempotencyKey?: string;
}): Promise<NotifyResult> {
  const dryRun = process.env.LEAD_EMAIL_DRY_RUN === "true";
  const apiKey = process.env.RESEND_API_KEY;

  if (dryRun || !apiKey) {
    process.stdout.write(
      `[lead-notify] ${dryRun ? "DRY RUN" : "no RESEND_API_KEY"} — would email ${msg.to}: ${msg.logLine}\n`
    );
    return { ok: true, via: dryRun ? "dry_run" : "skipped" };
  }

  const { subject, html, text } = msg;
  const payload = JSON.stringify({ from: msg.from, to: [msg.to], subject, html, text });

  // One retry on an unconfirmed failure (network error, timeout, 429, 5xx,
  // 409). Any other 4xx — an invalid key, unverified domain — is a definitive
  // rejection: retrying won't help, and the caller keeps the notification
  // undelivered so a later trigger retries it. Classified by status alone, so
  // an unreadable error body can't turn an unconfirmed outcome into a rejection.
  let last: NotifyResult = { ok: false, via: "resend", error: "not attempted" };
  // A rejection proves only that THIS request wasn't sent: after an earlier
  // unconfirmed attempt (which Resend may have accepted), the call as a whole
  // stays unconfirmed.
  let earlierUnconfirmed = false;
  for (let attempt = 1; attempt <= RESEND_ATTEMPTS; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(msg.idempotencyKey ? { "idempotency-key": msg.idempotencyKey.slice(0, 256) } : {}),
        },
        body: payload,
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
      if (res.ok) return { ok: true, via: "resend" };
      const body = await res.text().catch(() => "");
      last = { ok: false, via: "resend", error: `Resend ${res.status}: ${body.slice(0, 200)}` };
      const unconfirmed = res.status === 409 || res.status === 429 || res.status >= 500;
      if (!unconfirmed) return earlierUnconfirmed ? last : { ...last, rejected: true };
    } catch (err) {
      last = { ok: false, via: "resend", error: err instanceof Error ? err.message : String(err) };
    }
    earlierUnconfirmed = true;
    if (attempt < RESEND_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RESEND_RETRY_DELAY_MS));
    }
  }
  return last;
}

const RESEND_ATTEMPTS = 2;
const RESEND_RETRY_DELAY_MS = 600;
/** Per-request cap, so a hung connection can't outlive the caller's claim. */
const RESEND_TIMEOUT_MS = 8000;
/** Upper bound on one sendViaResend call (see CLAIM_LEASE_MS in handoff.ts). */
export const MAX_RESEND_MS =
  RESEND_ATTEMPTS * RESEND_TIMEOUT_MS + (RESEND_ATTEMPTS - 1) * RESEND_RETRY_DELAY_MS;

function renderText(i: LeadEmailInput): string {
  return [
    `Hey team!`,
    ``,
    `A new lead came in from Coco on cocolash.com.`,
    ``,
    `Email:           ${i.email}`,
    `Intent at capture: ${i.intent ?? "—"}`,
    `Discount offered:  ${i.discountOffered ?? "—"}`,
    `Notes:             ${i.notes ?? "—"}`,
    `Transcript:        ${i.transcriptLink}`,
    ``,
    `(Sent automatically by the CocoLash AI Sales Assistant.)`,
  ].join("\n");
}

function renderHtml(i: LeadEmailInput): string {
  return `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#28150e;background:#faf3e0;padding:24px">
<h2 style="color:#28150e;margin:0 0 8px 0">New CocoLash lead 💌</h2>
<p style="margin:0 0 16px 0">A visitor on <strong>cocolash.com</strong> chatted with Coco and shared their email.</p>
<table style="border-collapse:collapse;width:100%;background:#fff;border-radius:8px;padding:12px">
  <tr><td style="padding:6px 12px;color:#5a3a2c;font-size:13px">Email</td><td style="padding:6px 12px"><strong>${escapeHtml(i.email)}</strong></td></tr>
  <tr><td style="padding:6px 12px;color:#5a3a2c;font-size:13px">Intent</td><td style="padding:6px 12px">${escapeHtml(i.intent ?? "—")}</td></tr>
  <tr><td style="padding:6px 12px;color:#5a3a2c;font-size:13px">Discount offered</td><td style="padding:6px 12px">${escapeHtml(i.discountOffered ?? "—")}</td></tr>
  <tr><td style="padding:6px 12px;color:#5a3a2c;font-size:13px">Notes</td><td style="padding:6px 12px">${escapeHtml(i.notes ?? "—")}</td></tr>
  <tr><td style="padding:6px 12px;color:#5a3a2c;font-size:13px">Transcript</td><td style="padding:6px 12px"><a href="${escapeHtml(i.transcriptLink)}">View in admin</a></td></tr>
</table>
<p style="margin-top:24px;color:#5a3a2c;font-size:12px">Sent automatically by the CocoLash AI Sales Assistant.</p>
</body></html>`.trim();
}

function renderHandoffText(i: HandoffEmailInput): string {
  return [
    `Hey team!`,
    ``,
    `Coco handed a customer off to you on cocolash.com. They may be waiting on a reply.`,
    ``,
    `Customer email:  ${i.customerEmail ?? "not shared yet — see the transcript"}`,
    ``,
    `The customer said:`,
    i.customerMessage,
    ``,
    `Full conversation, including Coco's reply: ${i.transcriptLink}`,
    ``,
    `(Sent automatically by the CocoLash AI Sales Assistant.)`,
  ].join("\n");
}

function renderHandoffHtml(i: HandoffEmailInput): string {
  const block = (s: string) =>
    `<div style="white-space:pre-wrap;background:#fff;border-radius:8px;padding:12px;margin:0 0 16px 0">${escapeHtml(s)}</div>`;
  return `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#28150e;background:#faf3e0;padding:24px">
<h2 style="color:#28150e;margin:0 0 8px 0">Coco needs a human 🙋‍♀️</h2>
<p style="margin:0 0 16px 0">Coco handed a customer off to you on <strong>cocolash.com</strong>. They may be waiting on a reply.</p>
<p style="margin:0 0 6px 0;color:#5a3a2c;font-size:13px">Customer email</p>
<p style="margin:0 0 16px 0"><strong>${escapeHtml(i.customerEmail ?? "Not shared yet — see the transcript")}</strong></p>
<p style="margin:0 0 6px 0;color:#5a3a2c;font-size:13px">The customer said</p>
${block(i.customerMessage)}
<p style="margin:0"><a href="${escapeHtml(i.transcriptLink)}">View the full conversation, including Coco's reply, in the admin</a></p>
<p style="margin-top:24px;color:#5a3a2c;font-size:12px">Sent automatically by the CocoLash AI Sales Assistant.</p>
</body></html>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
