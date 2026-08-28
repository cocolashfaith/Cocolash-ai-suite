import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";

const bodySchema = z.object({
  newPassword: z.string().min(8).max(200),
});

/**
 * POST /api/chatbot/admin/account/password — the signed-in admin changes their
 * OWN password. Requires an individual Supabase login; sessions authenticated
 * only via the shared access password have no personal password to change and
 * get a clear message pointing them to Manage Admins.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_password", message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(
        {
          error: "no_individual_account",
          message:
            "You're signed in with the shared access password, which has no personal password to change. Ask an owner to create you an individual login under Manage Admins, then set your password here.",
        },
        { status: 400 }
      );
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
    if (error) {
      return Response.json({ error: "update_failed", message: error.message }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
