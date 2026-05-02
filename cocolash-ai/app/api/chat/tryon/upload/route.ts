/**
 * POST /api/chat/tryon/upload — accept a selfie for virtual try-on.
 *
 * Multipart form:
 *   - file:    image/jpeg or image/png (≤ 8 MB)
 *   - session: session UUID
 *   - consent: "true" string (server enforces)
 *
 * Writes to the private `chat-selfies` bucket and inserts a
 * selfie_uploads row with expires_at = now + 24h. Returns the public
 * URL (signed, since the bucket is private) and the expiry.
 */

import { NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TTL_SECONDS = 24 * 60 * 60;

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

export async function OPTIONS(req: NextRequest): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest): Promise<Response> {
  const headers = { "content-type": "application/json", ...corsHeaders(req.headers.get("origin")) };

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_form" }), { status: 400, headers });
  }

  const file = form.get("file");
  const sessionId = form.get("session");
  const consent = form.get("consent");

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "missing_file" }), { status: 400, headers });
  }
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return new Response(JSON.stringify({ error: "invalid_session" }), { status: 400, headers });
  }
  if (consent !== "true") {
    return new Response(JSON.stringify({ error: "consent_required" }), { status: 400, headers });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return new Response(
      JSON.stringify({ error: "unsupported_type", allowed: [...ALLOWED_TYPES] }),
      { status: 415, headers }
    );
  }
  if (file.size > MAX_BYTES) {
    return new Response(
      JSON.stringify({ error: "too_large", maxBytes: MAX_BYTES }),
      { status: 413, headers }
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
  const supabase = createServiceClient(url, key, { auth: { persistSession: false } });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${sessionId}/${uuidv4()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from("chat-selfies")
    .upload(path, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (upErr) {
    return new Response(
      JSON.stringify({ error: "upload_failed", message: upErr.message }),
      { status: 500, headers }
    );
  }

  // Signed URL for the consumer (Gemini fetcher) to download. Expires when
  // the row expires (24h).
  const { data: signed, error: signErr } = await supabase.storage
    .from("chat-selfies")
    .createSignedUrl(path, TTL_SECONDS);
  if (signErr || !signed) {
    return new Response(
      JSON.stringify({ error: "sign_failed", message: signErr?.message ?? "no url" }),
      { status: 500, headers }
    );
  }

  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  await supabase.from("selfie_uploads").insert({
    session_id: sessionId,
    storage_path: path,
    consent_given_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  return new Response(
    JSON.stringify({ url: signed.signedUrl, path, expiresAt }),
    { status: 200, headers }
  );
}
