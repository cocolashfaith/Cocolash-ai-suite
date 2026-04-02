import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { BackgroundMusic } from "@/lib/types";

/**
 * GET /api/backgrounds
 *
 * Lists available background music tracks from the `background_music` table.
 * Supports filtering by category.
 *
 * Music mixing into videos is deferred to Phase 2.8 (requires external
 * FFmpeg service), but this endpoint enables the UI to display available
 * tracks for future selection.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const supabase = await createAdminClient();

    let query = supabase
      .from("background_music")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[backgrounds] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch background music" },
        { status: 500 }
      );
    }

    const tracks = (data ?? []) as BackgroundMusic[];

    const categories = [...new Set(tracks.map((t) => t.category).filter(Boolean))];

    return NextResponse.json({
      tracks,
      categories,
      total: tracks.length,
    });
  } catch (error: unknown) {
    console.error("[backgrounds] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to list background music";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
