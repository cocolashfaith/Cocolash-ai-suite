/**
 * GET/PATCH /api/settings/video — global video defaults + Seedance 2.5
 * pricing (D4/D5). ONE row in `video_settings`.
 *
 *   GET   public to signed-in app users (the wizard needs the defaults and
 *         the live rates). Never fails: a missing table (migration not run)
 *         returns DEFAULT_VIDEO_SETTINGS with `missingTable: true` and 200.
 *   PATCH admins only (`requireChatAdmin` — the shared access-password admin
 *         counts, which is why `updated_by` is TEXT, not a FK to auth.users).
 *
 * Writes use the service-role client because `video_settings` RLS grants
 * read-only to authenticated users.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_SETTINGS_SINGLETON_ID,
  VIDEO_SETTINGS_TABLE,
  VideoSettingsSchema,
  loadVideoSettings,
  mergeVideoSettings,
  type VideoSettingsResponse,
} from "@/lib/settings/video-settings";
import {
  MIGRATION_REQUIRED_STATUS,
  isMissingTableError,
  migrationRequiredBody,
} from "@/lib/supabase/schema-errors";
import { formatZodIssues } from "@/lib/seedance/v25/schema";

export const runtime = "nodejs";

const FALLBACK: VideoSettingsResponse = {
  settings: DEFAULT_VIDEO_SETTINGS,
  fromDatabase: false,
  missingTable: false,
};

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createAdminClient();
    const { settings, fromDatabase, missingTable } = await loadVideoSettings(supabase);
    return NextResponse.json({ settings, fromDatabase, missingTable }, { status: 200 });
  } catch (err) {
    // The wizard must always have values — never 500 a read.
    console.error("[settings/video] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(FALLBACK, { status: 200 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  // 1. Admin gate (access-password owner OR chat_admin_users row).
  let updatedBy: string;
  try {
    const supabase = await createClient();
    const admin = await requireChatAdmin(supabase);
    // TEXT column: the access-password admin has no auth.users row.
    updatedBy = admin.authUserId;
  } catch (err) {
    if (err instanceof ChatError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[settings/video] auth check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // 2. Body.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_settings", issues: "Body is not valid JSON" }, { status: 400 });
  }

  const parsed = VideoSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_settings", issues: formatZodIssues(parsed.error) },
      { status: 400 }
    );
  }
  const patch = parsed.data;
  const updatedAt = new Date().toISOString();

  // 3. Write (service role — RLS is read-only for users).
  try {
    const db = await createAdminClient();

    const { data, error } = await db
      .from(VIDEO_SETTINGS_TABLE)
      .update({ ...patch, updated_at: updatedAt, updated_by: updatedBy })
      .eq("is_singleton", true)
      .select()
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(migrationRequiredBody(error), { status: MIGRATION_REQUIRED_STATUS });
      }
      console.error("[settings/video] PATCH update error:", error);
      return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
    }

    if (data) {
      return NextResponse.json({ ok: true, settings: mergeVideoSettings(data) }, { status: 200 });
    }

    // No singleton yet (table created but not seeded) — create it.
    const { data: created, error: upsertError } = await db
      .from(VIDEO_SETTINGS_TABLE)
      .upsert(
        {
          id: VIDEO_SETTINGS_SINGLETON_ID,
          is_singleton: true,
          ...patch,
          updated_at: updatedAt,
          updated_by: updatedBy,
        },
        { onConflict: "is_singleton" }
      )
      .select()
      .single();

    if (upsertError) {
      if (isMissingTableError(upsertError)) {
        return NextResponse.json(migrationRequiredBody(upsertError), {
          status: MIGRATION_REQUIRED_STATUS,
        });
      }
      console.error("[settings/video] PATCH upsert error:", upsertError);
      return NextResponse.json(
        { error: "update_failed", message: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, settings: mergeVideoSettings(created) }, { status: 200 });
  } catch (err) {
    console.error("[settings/video] PATCH failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
