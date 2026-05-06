#!/usr/bin/env tsx
/**
 * Seed a chat admin user to the chat_admin_users table.
 *
 * Usage:
 *   npx tsx scripts/seed-chat-admin.ts --email <email> --role <admin|operator>
 *
 * Environment:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY (required for service-role access)
 *
 * The script:
 * 1. Resolves the email to auth_user_id from auth.users
 * 2. Upserts a row in chat_admin_users with the given role
 * 3. Exits with code 0 on success, 1 on error
 */

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const emailIndex = args.indexOf("--email");
const roleIndex = args.indexOf("--role");

const email = emailIndex >= 0 ? args[emailIndex + 1] : undefined;
const role = roleIndex >= 0 ? args[roleIndex + 1] : "admin";

if (!email) {
  // eslint-disable-next-line no-console
  console.error("Usage: npx tsx scripts/seed-chat-admin.ts --email <email> --role <admin|operator>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  // eslint-disable-next-line no-console
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

(async () => {
  try {
    // Resolve email to auth_user_id via listUsers
    const { data } = await supabase.auth.admin.listUsers();
    const users = data?.users ?? [];
    const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    const userId = user?.id;

    if (!userId) {
      // eslint-disable-next-line no-console
      console.error(`No auth user found for "${email}". They must sign in once first.`);
      process.exit(1);
    }

    // Upsert into chat_admin_users
    const { error } = await supabase.from("chat_admin_users").upsert({
      auth_user_id: userId,
      email,
      role,
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Upsert error:", error);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(`Seeded ${email} as ${role}`);
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Unexpected error:", err);
    process.exit(1);
  }
})();
