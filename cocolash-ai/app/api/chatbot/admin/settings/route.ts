import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";
import { CHAT_SETTINGS_SINGLETON_ID } from "@/lib/chat/db";

export const runtime = "nodejs";

const SettingsPatch = z.object({
  bot_enabled: z.boolean().optional(),
  daily_cap_usd: z.number().min(0).max(10000).optional(),
  default_top_k: z.number().int().min(1).max(20).optional(),
  system_prompt_version: z.string().min(1).max(40).optional(),
});

export async function PATCH(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    const admin = await requireChatAdmin(supabase);
    const body = SettingsPatch.parse(await req.json());
    const { error } = await supabase
      .from("chat_settings")
      .update({ ...body, updated_by: admin.authUserId })
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
