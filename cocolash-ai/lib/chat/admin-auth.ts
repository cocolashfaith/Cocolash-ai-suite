/**
 * lib/chat/admin-auth.ts — guards for /chatbot/admin pages and routes.
 *
 * Two paths grant admin:
 *   1. The shared access password (AUTH_PASSWORD → `cocolash-auth` cookie).
 *      Anyone who signed in with the access password is treated as an owner.
 *      This is the reliable path and does not depend on Supabase Auth.
 *   2. A Supabase Auth user whose email is in the chat_admin_users table.
 *      Seed with: npx tsx scripts/seed-chat-admin.ts --email <email> --role admin
 */

import { cookies } from "next/headers";
import { type SupabaseClient } from "@supabase/supabase-js";
import { ChatError } from "./error";

export interface ChatAdmin {
  authUserId: string;
  email: string;
  role: "owner" | "team";
}

/**
 * True when the request carries a valid access-password cookie. Anyone who
 * logged in with the shared access password (AUTH_PASSWORD) gets admin access.
 * Server-only (reads the request cookie jar).
 */
async function hasAccessPasswordCookie(): Promise<boolean> {
  const expected = process.env.AUTH_TOKEN;
  if (!expected) return false;
  try {
    const jar = await cookies();
    return jar.get("cocolash-auth")?.value === expected;
  } catch {
    // cookies() throws outside a request scope (e.g. in unit tests). Treat as
    // "no legacy cookie" and fall back to the Supabase path.
    return false;
  }
}

export async function requireChatAdmin(supabase: SupabaseClient): Promise<ChatAdmin> {
  // Path 1: shared access password → full admin (owner).
  if (await hasAccessPasswordCookie()) {
    return { authUserId: "access-password", email: "access-password", role: "owner" };
  }

  // Path 2: a Supabase Auth user listed in chat_admin_users.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new ChatError("not_authenticated", 401, "consent_required");
  }
  const user = data.user;

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
