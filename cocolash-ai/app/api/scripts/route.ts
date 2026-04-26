import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateVideoScript } from "@/lib/openrouter/captions";
import { CAMPAIGN_CONCEPT_POOLS } from "@/lib/prompts/scripts/templates";
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
  "brand-story",
  "faq",
  "myths",
  "product-knowledge",
];

const VALID_TONES: ScriptTone[] = ["casual", "energetic", "calm", "professional"];
const VALID_DURATIONS: VideoDuration[] = [15, 30, 60, 90];

/**
 * POST /api/scripts
 *
 * Generates 3 UGC video script variations using Claude via OpenRouter.
 * Always persists scripts to the database. When no campaignFocus is
 * provided, auto-selects a concept from CAMPAIGN_CONCEPT_POOLS and
 * fetches recent hooks to avoid repetition.
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
      campaignFocus,
      customInstructions,
      excludeHooks,
    } = body as {
      campaignType?: CampaignType;
      tone?: ScriptTone;
      duration?: number;
      productName?: string;
      keyFeatures?: string[];
      targetAudience?: string;
      specialOffer?: string;
      campaignFocus?: string;
      customInstructions?: string;
      excludeHooks?: string[];
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

    let autoConcept: string | undefined;
    let noveltySeed: string | undefined;
    let recentScriptSummaries: string[] | undefined;

    const supabase = await createAdminClient();

    if (!campaignFocus) {
      const pool = CAMPAIGN_CONCEPT_POOLS[campaignType];
      if (pool && pool.length > 0) {
        autoConcept = pool[Math.floor(Math.random() * pool.length)];
      }

      noveltySeed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const { data: recentRows } = await supabase
        .from("video_scripts")
        .select("hook_text")
        .eq("campaign_type", campaignType)
        .order("created_at", { ascending: false })
        .limit(10);

      const dbHooks = (recentRows ?? [])
        .map((r: { hook_text: string | null }) => r.hook_text)
        .filter((h): h is string => Boolean(h));

      if (excludeHooks && excludeHooks.length > 0) {
        recentScriptSummaries = [...excludeHooks, ...dbHooks];
      } else if (dbHooks.length > 0) {
        recentScriptSummaries = dbHooks;
      }
    }

    const scripts = await generateVideoScript({
      campaignType,
      tone,
      duration: durationNum as VideoDuration,
      productName,
      keyFeatures,
      targetAudience,
      specialOffer,
      campaignFocus,
      customInstructions,
      autoConcept,
      noveltySeed,
      recentScriptSummaries,
    });

    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const templateLabel = campaignType
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const inserts = scripts.map((s, i) => ({
      title: `${templateLabel} - ${tone.charAt(0).toUpperCase() + tone.slice(1)} - ${durationNum}s - ${dateStr} (#${i + 1})`,
      campaign_type: campaignType,
      tone,
      duration_seconds: durationNum,
      script_text: s.full_script,
      hook_text: s.hook,
      cta_text: s.cta,
      is_template: false,
    }));

    let savedIds: string[] | null = null;

    const { data, error } = await supabase
      .from("video_scripts")
      .insert(inserts)
      .select("id");

    if (error) {
      console.error("[scripts] Save error:", error);
    } else {
      savedIds = (data ?? []).map((r: { id: string }) => r.id);
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
