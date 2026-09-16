import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-errors";
import { checkSeedanceSubmitRateLimit } from "@/lib/seedance/submit-rate-limit";
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
 * identical prompt, identical input URLs), forces `resolution: "1080p"` and
 * `bitrate_mode: "high"` (free — Enhancor does not price bitrate), applies
 * the optional duration override, and runs the SAME 2.5 generation path with
 * `qualityTier: "final-1080p"` and `rerenderOf` pointing at the source. The new
 * row links back via `rerender_of`.
 *
 * A source row is re-renderable only when it is a COMPLETED Seedance 2.5 job
 * that stored its payload and was not already 1080p — anything else is a 409.
 *
 * Idempotency: a source that already has a live (pending/processing/completed)
 * re-render is a 409 `already_rerendered` carrying the existing video id. A
 * double-clicked button, a retried fetch or a replayed request therefore costs
 * ONE 1080p job, not two. A per-session token bucket throttles the route on
 * top of that (see lib/seedance/submit-rate-limit.ts).
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

    const throttled = checkSeedanceSubmitRateLimit(request);
    if (throttled) return throttled;

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

    const existing = await findLiveRerender(supabase, source.id);
    if (existing) {
      return NextResponse.json(
        {
          error: "This video has already been re-rendered as Final 1080p",
          code: "already_rerendered",
          existingVideoId: existing,
        },
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
        // F1: Enhancor rates key on resolution x duration x video-inputs only —
        // `bitrate_mode` is not priced, so "high" is free. This IS the Final
        // master, so it always overrides whatever the draft was rendered at.
        bitrate_mode: "high",
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

/**
 * The id of an existing pending/processing/completed re-render of `sourceId`,
 * or null when there is none. A pre-migration database has no `rerender_of`
 * column — that is "none", not an error (2.5 rows cannot exist there anyway).
 * Any other query failure is logged and treated as "none" so a transient DB
 * hiccup cannot permanently block a legitimate re-render.
 */
async function findLiveRerender(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  sourceId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("generated_videos")
    .select("id")
    .eq("rerender_of", sourceId)
    .in("heygen_status", ["pending", "processing", "completed"])
    .limit(1);

  if (error) {
    if (!isMissingColumnError(error)) {
      console.error("[seedance/rerender] Existing re-render lookup failed:", error);
    }
    return null;
  }

  const rows = (data ?? []) as Array<{ id?: string }>;
  return rows[0]?.id ?? null;
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
