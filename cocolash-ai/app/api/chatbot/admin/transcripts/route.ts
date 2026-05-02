import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return Response.json({ error: "missing_session_id" }, { status: 400 });

    const [{ data: session }, { data: messages }] = await Promise.all([
      supabase.from("chat_sessions").select("*").eq("id", sessionId).maybeSingle(),
      supabase
        .from("chat_messages")
        .select("id, role, content, intent, retrieved_chunk_ids, tryon_image_url, tokens_in, tokens_out, latency_ms, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);

    return Response.json({ session, messages: messages ?? [] });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    return Response.json({ error: "fetch_failed" }, { status: 500 });
  }
}
