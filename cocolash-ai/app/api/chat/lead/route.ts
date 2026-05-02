/**
 * POST /api/chat/lead — capture a lead email from the widget.
 *
 * Stores the row in lead_captures and emits a notification email to
 * support@cocolash.com (or the configured CHATBOT_SUPPORT_EMAIL).
 * The email send is best-effort — DB row is the durable record.
 */

import { NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { LeadPayloadSchema } from "@/lib/chat/lead-validation";
import { sendLeadEmail } from "@/lib/chat/notify";

export const runtime = "nodejs";

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

export async function OPTIONS(req: NextRequest): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"));
  const headers: HeadersInit = { "content-type": "application/json", ...cors };

  let payload;
  try {
    payload = LeadPayloadSchema.parse(await req.json());
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "invalid_request", message: String(err) }),
      { status: 400, headers }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(
      JSON.stringify({ error: "server_not_configured" }),
      { status: 500, headers }
    );
  }
  const supabase = createServiceClient(url, key, {
    auth: { persistSession: false },
  });

  const { data: insertRow, error } = await supabase
    .from("lead_captures")
    .insert({
      session_id: payload.sessionId,
      email: payload.email,
      consent: payload.consent,
      intent_at_capture: payload.intentAtCapture ?? null,
      discount_offered: payload.discountOffered ?? null,
      notes: payload.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !insertRow) {
    return new Response(
      JSON.stringify({
        error: "persist_failed",
        message: error?.message ?? "no row returned",
      }),
      { status: 500, headers }
    );
  }

  // Best-effort notify; failure is logged, not exposed to the visitor.
  const transcriptLink = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/chatbot/admin/transcripts/${payload.sessionId}`;
  const notify = await sendLeadEmail({
    to: process.env.CHATBOT_SUPPORT_EMAIL ?? "support@cocolash.com",
    fromName: "CocoLash AI",
    fromEmail: process.env.LEAD_EMAIL_FROM ?? "leads@cocolash.com",
    email: payload.email,
    intent: payload.intentAtCapture ?? null,
    discountOffered: payload.discountOffered ?? null,
    transcriptLink,
    notes: payload.notes ?? null,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      leadId: insertRow.id,
      notified: notify.ok,
      via: notify.via,
    }),
    { status: 200, headers }
  );
}
