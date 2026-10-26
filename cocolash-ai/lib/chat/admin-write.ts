/**
 * Admin writes go through the SERVICE client, after `requireChatAdmin` has
 * authorized the caller (found 2026-10-26).
 *
 * The admin routes used to write with the user-scoped Supabase client. For the
 * shared access-password login there is no Supabase session, so row-level
 * security blocks the UPDATE — and PostgREST reports a blocked UPDATE as a
 * success with zero rows. The route returned `{ ok: true }` and nothing was
 * saved (Voice, Settings — incl. the kill switch and daily cap — and
 * Discounts). Authorization stays in `requireChatAdmin`; the write itself no
 * longer depends on which login path the admin used.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ChatError } from "./error";

/**
 * Service-role client with NO cookies and no session. `createAdminClient()`
 * (lib/supabase/server) is built on @supabase/ssr and reads the request's
 * cookies — if the admin's browser also carries a non-admin Supabase session,
 * that user's JWT is sent instead of the service role and RLS can still block
 * the write. Only call this after `requireChatAdmin` has authorized the caller.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ChatError("Supabase service role is not configured", 500, "internal_error");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `updated_by` columns reference an auth user id (uuid). The access-password
 * admin has no auth user, so it is recorded as null rather than writing a
 * non-uuid string the column would reject.
 */
export function auditUserId(authUserId: string): string | null {
  return UUID_RE.test(authUserId) ? authUserId : null;
}

/**
 * Throws when an UPDATE matched no rows, so a write that changed nothing can
 * never be reported to the admin as saved again.
 */
export function assertRowsUpdated(
  rows: readonly unknown[] | null,
  what: string
): void {
  if (!rows || rows.length === 0) {
    throw new ChatError(`${what}: no row was updated`, 500, "internal_error");
  }
}
