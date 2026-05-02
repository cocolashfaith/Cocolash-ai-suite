/**
 * lib/chat/admin-auth.ts — guards for /chatbot/admin pages and routes.
 *
 * Allow if the auth user has a row in chat_admin_users OR their email
 * matches the ADMIN_EMAIL constant used by the existing app/api/admin/users
 * route. The latter ensures Faith can log in immediately on day one before
 * her team is seeded.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { ChatError } from "./error";

const FALLBACK_ADMIN_EMAIL = "admin@cocolash.com";

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

  // Email-based fallback (Faith on day one before her row is seeded).
  if (user.email && user.email.toLowerCase() === FALLBACK_ADMIN_EMAIL.toLowerCase()) {
    return { authUserId: user.id, email: user.email, role: "owner" };
  }

  // Membership table check.
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
