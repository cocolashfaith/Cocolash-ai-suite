import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";

const DiscountUpdate = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "expired"]).optional(),
  intent_triggers: z.array(z.string()).nullable().optional(),
  product_line_scope: z.array(z.string()).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);
    const body = DiscountUpdate.parse(await req.json());
    const { id, ...patch } = body;
    const { error } = await supabase.from("discount_rules").update(patch).eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    return Response.json(
      { error: "patch_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
