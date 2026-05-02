/**
 * POST /api/chat/tryon — run a virtual try-on for a session.
 *
 * Input: { sessionId, productHandle, selfieUrl }
 * Output: { composedUrl, messageId }
 *
 * Persists the result as a chat_messages row (role='assistant',
 * tryon_image_url set, content = a friendly inline note) so it shows up
 * in the transcript and the widget renders it in line.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { runTryOn } from "@/lib/chat/tryon";
import { appendMessage, recordCostEvent } from "@/lib/chat/db";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";
export const maxDuration = 60;

const TryOnRequest = z.object({
  sessionId: z.string().uuid(),
  productHandle: z.string().min(1).max(120),
  selfieUrl: z.string().url(),
});

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

  let body;
  try {
    body = TryOnRequest.parse(await req.json());
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "invalid_request", message: String(err) }),
      { status: 400, headers }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "server_not_configured" }), { status: 500, headers });
  }
  const supabase = createServiceClient(url, key, { auth: { persistSession: false } });

  try {
    const result = await runTryOn(supabase, body);
    const message = await appendMessage(supabase, {
      session_id: body.sessionId,
      role: "assistant",
      content: `Here you go gorgeous! Here's how ${body.productHandle.replace(/-/g, " ")} looks on you 💛`,
      tryon_image_url: result.composedUrl,
    });

    // Record approximate Gemini cost (refined by Phase 9).
    await recordCostEvent(supabase, {
      session_id: body.sessionId,
      pipeline: "tryon_compose",
      model: "gemini-3-pro-image",
      total_cost_usd: 0.02,
    }).catch(() => undefined);

    return new Response(
      JSON.stringify({ composedUrl: result.composedUrl, messageId: message.id }),
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof ChatError) {
      return new Response(
        JSON.stringify({ error: err.code, message: err.message }),
        { status: err.status, headers }
      );
    }
    return new Response(
      JSON.stringify({
        error: "tryon_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers }
    );
  }
}
