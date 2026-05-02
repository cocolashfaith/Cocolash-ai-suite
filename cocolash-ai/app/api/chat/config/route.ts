/**
 * GET /api/chat/config — public widget bootstrap config.
 *
 * Returns the live greeting (from chat_settings.voice_fragments) and the
 * bot_enabled state so the widget can:
 *   1. Render the actual greeting (not a stale baked-in copy).
 *   2. Respect the kill-switch (Phase 7 admin toggles it; Phase 9 cost cap
 *      flips it automatically).
 *
 * No auth required — the widget runs on cocolash.com without credentials.
 * CORS is permissive for now (Stage 1); Phase 8 narrows via App Proxy HMAC.
 */

import { NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getChatSettings } from "@/lib/chat/db";
import { DEFAULT_VOICE_FRAGMENTS } from "@/lib/chat/voice";

export const runtime = "nodejs";
export const revalidate = 0;

const ALLOWED_ORIGINS = [
  /^https?:\/\/cocolash\.com$/,
  /^https?:\/\/(?:www|shop|store|.*--cocolash)\.cocolash\.com$/,
  /^https:\/\/cocolash\.myshopify\.com$/,
  /^https?:\/\/localhost(:\d+)?$/,
];

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin) return { "access-control-allow-origin": "*" };
  const allowed = ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    "access-control-allow-origin": allowed ? origin : "https://cocolash.com",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin",
  };
}

export async function OPTIONS(req: NextRequest): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const origin = req.headers.get("origin");
  const headers: HeadersInit = {
    "content-type": "application/json",
    "cache-control": "public, max-age=30",
    ...corsHeaders(origin),
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(
      JSON.stringify({
        greeting: DEFAULT_VOICE_FRAGMENTS.greeting,
        personaName: DEFAULT_VOICE_FRAGMENTS.persona_name,
        botEnabled: false,
      }),
      { status: 200, headers }
    );
  }

  try {
    const supabase = createServiceClient(url, key, {
      auth: { persistSession: false },
    });
    const settings = await getChatSettings(supabase);
    const fragments = (settings.voice_fragments ?? DEFAULT_VOICE_FRAGMENTS) as typeof DEFAULT_VOICE_FRAGMENTS;
    return new Response(
      JSON.stringify({
        greeting: fragments.greeting,
        personaName: fragments.persona_name,
        botEnabled: settings.bot_enabled,
      }),
      { status: 200, headers }
    );
  } catch {
    return new Response(
      JSON.stringify({
        greeting: DEFAULT_VOICE_FRAGMENTS.greeting,
        personaName: DEFAULT_VOICE_FRAGMENTS.persona_name,
        botEnabled: true,
      }),
      { status: 200, headers }
    );
  }
}
