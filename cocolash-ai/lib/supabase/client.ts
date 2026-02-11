import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase Browser Client
 *
 * Used in Client Components. Singleton pattern — returns the same
 * client instance across the app.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
