/**
 * lib/chat/admin-auth.ts — guards for /chatbot/admin pages and routes.
 *
 * Admin access via chat_admin_users table only. To seed the first admin:
 * Run: npx tsx scripts/seed-chat-admin.ts --email <email> --role admin
 *
 * That script resolves the email to auth_user_id and creates the row.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { ChatError } from "./error";

export interface ChatAdmin {
  authUserId: string;
  email: string;
  role: "owner" | "team";
}

export async function requireChatAdmin(supabase: SupabaseClient): Promise<ChatAdmin> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new ChatError("not_authenticated", 401, "consent_required");
  }
  const user = data.user;

  // Membership table check — only path to admin access.
  const { data: row } = await supabase
    .from("chat_admin_users")
    .select("auth_user_id, email, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (row) {
    const r = row as { auth_user_id: string; email: string; role: "owner" | "team" };
    return { authUserId: r.auth_user_id, email: r.email, role: r.role };
  }

  throw new ChatError("forbidden", 403, "session_disabled");
}

export async function isChatAdmin(supabase: SupabaseClient): Promise<boolean> {
  try {
    await requireChatAdmin(supabase);
    return true;
  } catch {
    return false;
  }
}
