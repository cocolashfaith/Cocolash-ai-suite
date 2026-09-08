import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  MIGRATION_REQUIRED_STATUS,
  isMissingColumnError,
  migrationRequiredBody,
} from "@/lib/supabase/schema-errors";
import type { GeneratedVideo } from "@/lib/types";

/**
 * GET /api/videos
 *
 * Lists generated videos, paginated and sorted by creation date.
 * Supports filtering by status, pipeline and Seedance engine.
 *
 * `engine=2.0|2.5` (D1/D14) filters on the column added by
 * `supabase/migrations/20260908_seedance25.sql`. Before that migration runs the
 * column does not exist and Postgres answers 42703 — we turn that into the
 * actionable 503 "migration_required" body instead of a generic 500 so the
 * gallery can tell the user exactly which SQL file to run.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const pipeline = searchParams.get("pipeline");
    const engine = searchParams.get("engine");
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
    const offset = Number(searchParams.get("offset") ?? 0);

    const supabase = await createAdminClient();

    let query = supabase
      .from("generated_videos")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("heygen_status", status);
    }

    if (pipeline && (pipeline === "heygen" || pipeline === "seedance")) {
      query = query.eq("pipeline", pipeline);
    }

    if (engine === "2.0" || engine === "2.5") {
      query = query.eq("engine", engine);
    }

    const { data, error, count } = await query;

    if (error) {
      // Pre-migration: `engine` does not exist yet. Say so, don't 500.
      if (isMissingColumnError(error)) {
        console.warn("[videos] Seedance 2.5 columns missing — migration not applied");
        return NextResponse.json(migrationRequiredBody(error), {
          status: MIGRATION_REQUIRED_STATUS,
        });
      }
      console.error("[videos] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch videos" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      videos: (data ?? []) as GeneratedVideo[],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error: unknown) {
    console.error("[videos] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to list videos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
