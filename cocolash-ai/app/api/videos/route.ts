import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { GeneratedVideo } from "@/lib/types";

/**
 * GET /api/videos
 *
 * Lists generated videos, paginated and sorted by creation date.
 * Supports filtering by HeyGen status.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
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

    const { data, error, count } = await query;

    if (error) {
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
