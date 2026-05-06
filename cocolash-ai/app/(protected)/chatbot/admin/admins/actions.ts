"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";

/**
 * Server action to add a new chat admin by email.
 * Resolves email to auth_user_id and upserts into chat_admin_users.
 * Only callable by existing admins (defense in depth).
 */
export async function addChatAdmin(formData: FormData): Promise<void> {
  try {
    // Check that the caller is already an admin
    const supabase = await createClient();
    await requireChatAdmin(supabase);

    const email = formData.get("email") as string;
    const role = (formData.get("role") as string) || "team";

    if (!email || !email.includes("@")) {
      throw new Error("Invalid email address");
    }

    // Use service-role client to resolve email and upsert
    const adminClient = await createAdminClient();

    // Resolve email to auth_user_id via listUsers
    const { data } = await adminClient.auth.admin.listUsers();
    const users = data?.users ?? [];
    const authUser = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    const userId = authUser?.id;

    if (!userId) {
      throw new Error(`No auth user found for "${email}". They must sign in once first.`);
    }

    // Upsert into chat_admin_users
    const { error } = await adminClient.from("chat_admin_users").upsert({
      auth_user_id: userId,
      email,
      role,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/chatbot/admin/admins");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(message);
  }
}

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
