import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";
import { CHAT_SETTINGS_SINGLETON_ID } from "@/lib/chat/db";

export const runtime = "nodejs";

const VoiceFragmentsSchema = z.object({
  persona_name: z.string().min(1).max(40),
  greeting: z.string().min(1).max(400),
  recommend_intro: z.string().min(1).max(600),
  escalation: z.string().min(1).max(600),
  after_hours_suffix: z.string().min(1).max(400),
  lead_capture: z.string().min(1).max(600),
  tryon_offer: z.string().min(1).max(400),
  dont_know: z.string().min(1).max(400),
});

export async function PATCH(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    const admin = await requireChatAdmin(supabase);
    const fragments = VoiceFragmentsSchema.parse(await req.json());
    const { error } = await supabase
      .from("chat_settings")
      .update({ voice_fragments: fragments, updated_by: admin.authUserId })
      .eq("id", CHAT_SETTINGS_SINGLETON_ID);
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof ChatError) {
      return new Response(JSON.stringify({ error: err.code }), { status: err.status });
    }
    return new Response(
      JSON.stringify({ error: "patch_failed", message: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
