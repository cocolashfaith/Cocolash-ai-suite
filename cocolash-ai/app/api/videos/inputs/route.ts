/**
 * GET /api/videos/inputs?limit=60 — "From your videos" (Seedance 2.5, D6).
 *
 * Lists finished renders the user can reuse as a Seedance reference video.
 * Only rows with a URL that is STILL ALIVE are returned: the closed Cloudinary
 * account `dtnvppaty` (59 rows, 401) and the expired `files*.heygen.ai` links
 * are dropped by `toVideoInputCandidate`, because handing one to Enhancor
 * produces a job that fails minutes later with an opaque download error.
 *
 * `select("*")` on purpose — naming the Seedance 2.5 columns would 42703 on a
 * database that has not run 20260908_seedance25.sql yet, and this picker must
 * keep working pre-migration.
 *
 * Contract (§2.11): 200 { videos: VideoInputCandidate[] }.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { toVideoInputCandidate } from "@/lib/video/input-sources";
import type { GeneratedVideo } from "@/lib/types";

/** Rows scanned before filtering — enough to fill a page after dead URLs go. */
const SCAN_LIMIT = 200;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requested = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Math.min(
      Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_LIMIT,
      MAX_LIMIT
    );

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("heygen_status", "completed")
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT);

    if (error) {
      console.error("[videos/inputs] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch your videos" },
        { status: 500 }
      );
    }

    const videos = ((data ?? []) as GeneratedVideo[])
      .map(toVideoInputCandidate)
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .slice(0, limit);

    return NextResponse.json({ videos });
  } catch (error: unknown) {
    // Detail stays in the server log; the client gets a fixed string.
    console.error("[videos/inputs] Error:", error);
    return NextResponse.json(
      { error: "Failed to list your videos" },
      { status: 500 }
    );
  }
}
