import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateVideoScript } from "@/lib/openrouter/captions";
import type {
  CampaignType,
  ScriptTone,
  VideoDuration,
  VideoScript,
} from "@/lib/types";

const VALID_CAMPAIGN_TYPES: CampaignType[] = [
  "product-showcase",
  "testimonial",
  "promo",
  "educational",
  "unboxing",
  "before-after",
];

const VALID_TONES: ScriptTone[] = ["casual", "energetic", "calm", "professional"];
const VALID_DURATIONS: VideoDuration[] = [15, 30, 60];

/**
 * POST /api/scripts
 *
 * Generates 3 UGC video script variations using Claude via OpenRouter.
 * Optionally saves scripts to the database when `save: true` is passed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      campaignType,
      tone,
      duration,
      productName,
      keyFeatures,
      targetAudience,
      specialOffer,
      save,
    } = body as {
      campaignType?: CampaignType;
      tone?: ScriptTone;
      duration?: number;
      productName?: string;
      keyFeatures?: string[];
      targetAudience?: string;
      specialOffer?: string;
      save?: boolean;
    };

    if (!campaignType || !VALID_CAMPAIGN_TYPES.includes(campaignType)) {
      return NextResponse.json(
        { error: `campaignType must be one of: ${VALID_CAMPAIGN_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!tone || !VALID_TONES.includes(tone)) {
      return NextResponse.json(
        { error: `tone must be one of: ${VALID_TONES.join(", ")}` },
        { status: 400 }
      );
    }

    const durationNum = Number(duration);
    if (!VALID_DURATIONS.includes(durationNum as VideoDuration)) {
      return NextResponse.json(
        { error: `duration must be one of: ${VALID_DURATIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const scripts = await generateVideoScript({
      campaignType,
      tone,
      duration: durationNum as VideoDuration,
      productName,
      keyFeatures,
      targetAudience,
      specialOffer,
    });

    let savedIds: string[] | null = null;

    if (save) {
      const supabase = await createAdminClient();

      const inserts = scripts.map((s, i) => ({
        title: `${campaignType} — ${tone} — ${durationNum}s (#${i + 1})`,
        campaign_type: campaignType,
        tone,
        duration_seconds: durationNum,
        script_text: s.full_script,
        hook_text: s.hook,
        cta_text: s.cta,
        is_template: false,
      }));

      const { data, error } = await supabase
        .from("video_scripts")
        .insert(inserts)
        .select("id");

      if (error) {
        console.error("[scripts] Save error:", error);
      } else {
        savedIds = (data ?? []).map((r: { id: string }) => r.id);
      }
    }

    return NextResponse.json({
      success: true,
      scripts,
      savedIds,
    });
  } catch (error: unknown) {
    console.error("[scripts] Error:", error);
    const message =
      error instanceof Error ? error.message : "Script generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/scripts
 *
 * Lists saved scripts from the `video_scripts` table.
 * Supports filtering by campaignType and pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignType = searchParams.get("campaignType");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
    const offset = Number(searchParams.get("offset") ?? 0);

    const supabase = await createAdminClient();

    let query = supabase
      .from("video_scripts")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (campaignType && VALID_CAMPAIGN_TYPES.includes(campaignType as CampaignType)) {
      query = query.eq("campaign_type", campaignType);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[scripts] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch scripts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      scripts: (data ?? []) as VideoScript[],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error: unknown) {
    console.error("[scripts] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to list scripts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
