import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runSeedance25Generation } from "@/lib/seedance/v25/generate";
import {
  RerenderBodySchema,
  Seedance25GenerateBodySchema,
  formatZodIssues,
} from "@/lib/seedance/v25/schema";
import type { GeneratedVideo } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/seedance/[id]/rerender — "Re-render as Final" (D3, 03-PLAN.md §1.4).
 *
 * Copies the source row's `request_payload` (the normalized Seedance25Request:
 * identical prompt, identical input URLs), forces `resolution: "1080p"`, applies
 * the optional duration override, and runs the SAME 2.5 generation path with
 * `qualityTier: "final-1080p"` and `rerenderOf` pointing at the source. The new
 * row links back via `rerender_of`.
 *
 * A source row is re-renderable only when it is a COMPLETED Seedance 2.5 job
 * that stored its payload and was not already 1080p — anything else is a 409.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsedBody = RerenderBodySchema.safeParse(rawBody ?? {});
    if (!parsedBody.success) {
      return NextResponse.json({ error: formatZodIssues(parsedBody.error) }, { status: 400 });
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const source = data as GeneratedVideo;
    const blocked = notRerenderableReason(source);
    if (blocked) {
      return NextResponse.json(
        { error: blocked, code: "not_rerenderable" },
        { status: 409 }
      );
    }

    const payload = source.request_payload as Record<string, unknown>;
    const mode = payload.mode as string;
    // `edit` is locked to Auto (-1) and `multi_frame` derives its duration from
    // the segment list, so a duration override is meaningless for both.
    const overrideApplies =
      parsedBody.data.duration !== undefined && mode !== "edit" && mode !== "multi_frame";

    const candidate = {
      engine: "2.5" as const,
      request: {
        ...payload,
        resolution: "1080p",
        ...(overrideApplies ? { duration: parsedBody.data.duration } : {}),
      },
      qualityTier: "final-1080p" as const,
      ...(source.script_text_cache
        ? { scriptText: source.script_text_cache.slice(0, 2500) }
        : {}),
      ...(source.script_id ? { scriptId: source.script_id } : {}),
      ...(source.background_type ? { campaignType: String(source.background_type) } : {}),
      rerenderOf: source.id,
    };

    const parsed = Seedance25GenerateBodySchema.safeParse(candidate);
    if (!parsed.success) {
      // The stored payload no longer validates (schema tightened, dead URL, …).
      return NextResponse.json({ error: formatZodIssues(parsed.error) }, { status: 400 });
    }

    return await runSeedance25Generation(parsed.data);
  } catch (err: unknown) {
    console.error("[seedance/rerender] Unexpected error:", err);
    return NextResponse.json(
      { error: "Re-render failed. Please try again." },
      { status: 500 }
    );
  }
}

/** null = re-renderable. Otherwise the human reason for the 409. */
function notRerenderableReason(video: GeneratedVideo): string | null {
  if (video.pipeline !== "seedance") {
    return "Only Seedance videos can be re-rendered";
  }
  if ((video.engine ?? "2.0") !== "2.5") {
    return "Only Seedance 2.5 videos can be re-rendered as Final";
  }
  if (!video.request_payload || typeof video.request_payload !== "object") {
    return "This video has no stored request payload to re-render";
  }
  if (video.heygen_status !== "completed") {
    return "Only completed videos can be re-rendered";
  }
  if (video.resolution === "1080p") {
    return "This video is already Final 1080p";
  }
  return null;
}
