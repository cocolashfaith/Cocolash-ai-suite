import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(["owner", "team"]).default("team"),
  // Optional: an admin may set an initial password; otherwise we generate one.
  password: z.string().min(8).max(200).optional(),
});

function generatePassword(): string {
  return "Coco-" + randomBytes(9).toString("base64url") + "-7A";
}

/**
 * POST /api/chatbot/admin/admins — create a brand-new individual login and grant
 * it chatbot-admin access. Uses auth.admin.createUser (which does NOT depend on
 * listUsers, so it works even while an unrelated auth row is unhealthy), then
 * records the membership in chat_admin_users. Returns the initial password ONCE
 * so the owner can hand it over; the new user should change it under Account.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_input", message: "Enter a valid email (and an optional 8+ char password)." },
        { status: 400 }
      );
    }
    const email = parsed.data.email.toLowerCase();
    const role = parsed.data.role;
    const password = parsed.data.password ?? generatePassword();

    const admin = await createAdminClient();

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      const msg = created.error?.message ?? "Could not create the login.";
      const alreadyExists = /already|exists|registered/i.test(msg);
      return Response.json(
        {
          error: alreadyExists ? "email_exists" : "create_failed",
          message: alreadyExists
            ? "That email already has a login. Remove it first, or have them use Account → change password."
            : msg,
        },
        { status: 400 }
      );
    }

    const { error: insErr } = await admin.from("chat_admin_users").upsert(
      { auth_user_id: created.data.user.id, email, role },
      { onConflict: "auth_user_id" }
    );
    if (insErr) {
      return Response.json({ error: "grant_failed", message: insErr.message }, { status: 400 });
    }

    return Response.json({ ok: true, email, role, password });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
