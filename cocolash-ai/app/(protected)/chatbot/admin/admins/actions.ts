"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";

/**
 * Server action to remove a chat admin by auth_user_id.
 * Only callable by existing admins (defense in depth).
 */
export async function removeChatAdmin(authUserId: string): Promise<void> {
  try {
    // Check that the caller is already an admin
    const supabase = await createClient();
    const caller = await requireChatAdmin(supabase);

    // Prevent self-removal
    if (caller.authUserId === authUserId) {
      throw new Error("Cannot remove yourself from the admin list");
    }

    // Use service-role client to delete
    const adminClient = await createAdminClient();
    const { error } = await adminClient
      .from("chat_admin_users")
      .delete()
      .eq("auth_user_id", authUserId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/chatbot/admin/admins");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(message);
  }
}
