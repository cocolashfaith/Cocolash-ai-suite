/**
 * lib/chat/notify.ts — Email handoff for captured leads.
 *
 * Sends to CHATBOT_SUPPORT_EMAIL via Resend when RESEND_API_KEY is set.
 * Falls back to a console log when LEAD_EMAIL_DRY_RUN is "true" or no key.
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
}

export interface NotifyResult {
  ok: boolean;
  via: "resend" | "dry_run" | "skipped";
  error?: string;
}

export async function sendLeadEmail(input: LeadEmailInput): Promise<NotifyResult> {
  const dryRun = process.env.LEAD_EMAIL_DRY_RUN === "true";
  const apiKey = process.env.RESEND_API_KEY;

  if (dryRun || !apiKey) {
    process.stdout.write(
      `[lead-notify] ${dryRun ? "DRY RUN" : "no RESEND_API_KEY"} — would email ${input.to}: lead ${input.email} (intent: ${input.intent ?? "?"}, discount: ${input.discountOffered ?? "none"})\n`
    );
    return { ok: true, via: dryRun ? "dry_run" : "skipped" };
  }

  const subject = `New CocoLash lead: ${input.email}`;
  const html = renderHtml(input);
  const text = renderText(input);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: `${input.fromName} <${input.fromEmail}>`,
        to: [input.to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        via: "resend",
        error: `Resend ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    return { ok: true, via: "resend" };
  } catch (err) {
    return {
      ok: false,
      via: "resend",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
