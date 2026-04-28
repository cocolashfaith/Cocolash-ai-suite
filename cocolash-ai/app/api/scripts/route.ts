import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateVideoScript } from "@/lib/openrouter/captions";
import { CAMPAIGN_CONCEPT_POOLS } from "@/lib/prompts/scripts/templates";
import type {
  CampaignType,
  ScriptTone,
  VideoPipeline,
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
const VALID_PIPELINES: VideoPipeline[] = ["heygen", "seedance"];

/**
 * POST /api/scripts
 *
 * Generates 3 UGC video script variations or saves a selected script.
 * Generated variations are not persisted until the user explicitly saves one.
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
      pipeline = "heygen",
      action = "generate",
      scriptText,
      hookText,
      ctaText,
      title,
    } = body as {
      campaignType?: CampaignType;
      tone?: ScriptTone;
      duration?: number;
      pipeline?: VideoPipeline;
      action?: "generate" | "save";
      scriptText?: string;
      hookText?: string;
      ctaText?: string;
      title?: string;
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

    if (!VALID_PIPELINES.includes(pipeline)) {
      return NextResponse.json(
        { error: `pipeline must be one of: ${VALID_PIPELINES.join(", ")}` },
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

    if (action === "save") {
      const trimmedScript = scriptText?.trim();
      if (!trimmedScript) {
        return NextResponse.json(
          { error: "scriptText is required" },
          { status: 400 }
        );
      }
      if (trimmedScript.length > 2500) {
        return NextResponse.json(
          { error: "scriptText must be 2500 characters or less" },
          { status: 400 }
        );
      }

      const supabase = await createAdminClient();
      const dateStr = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const templateLabel = formatCampaignLabel(campaignType);
      const defaultTitle = `${pipeline === "seedance" ? "Seedance" : "Agent"} — ${templateLabel} — ${tone} — ${durationNum}s — ${dateStr}`;

      const { data, error } = await supabase
        .from("video_scripts")
        .insert({
          title: title?.trim().slice(0, 200) || defaultTitle,
          pipeline,
          campaign_type: campaignType,
          tone,
          duration_seconds: durationNum,
          script_text: trimmedScript,
          hook_text: hookText?.trim().slice(0, 240) || trimmedScript.slice(0, 120),
          cta_text: ctaText?.trim().slice(0, 240) || null,
          is_template: false,
        })
        .select("*")
        .single();

      if (error || !data) {
        console.error("[scripts] Save error:", error);
        return NextResponse.json(
          { error: "Failed to save script" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        script: data as VideoScript,
        savedId: data.id,
      });
    }

    if (action !== "generate") {
      return NextResponse.json(
        { error: "action must be generate or save" },
        { status: 400 }
      );
    }

    const promptInputErrors = validatePromptInputs({
      productName,
      keyFeatures,
      targetAudience,
      specialOffer,
      campaignFocus,
      customInstructions,
      excludeHooks,
    });
    if (promptInputErrors.length > 0) {
      return NextResponse.json(
        { error: promptInputErrors.join("; ") },
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
        .eq("pipeline", pipeline)
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
      pipeline,
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

    return NextResponse.json({
      success: true,
      scripts,
      savedIds: [],
    });
  } catch (error: unknown) {
    console.error("[scripts] Error:", error);
    return NextResponse.json(
      { error: "Script generation failed. Please try again." },
      { status: 500 }
    );
  }
}

function validatePromptInputs(input: {
  productName?: string;
  keyFeatures?: string[];
  targetAudience?: string;
  specialOffer?: string;
  campaignFocus?: string;
  customInstructions?: string;
  excludeHooks?: string[];
}): string[] {
  const errors: string[] = [];

  if (input.productName && input.productName.length > 120) {
    errors.push("productName must be 120 characters or less");
  }
  if (input.targetAudience && input.targetAudience.length > 300) {
    errors.push("targetAudience must be 300 characters or less");
  }
  if (input.specialOffer && input.specialOffer.length > 300) {
    errors.push("specialOffer must be 300 characters or less");
  }
  if (input.campaignFocus && input.campaignFocus.length > 500) {
    errors.push("campaignFocus must be 500 characters or less");
  }
  if (input.customInstructions && input.customInstructions.length > 1200) {
    errors.push("customInstructions must be 1200 characters or less");
  }
  if (input.keyFeatures && input.keyFeatures.length > 12) {
    errors.push("keyFeatures cannot include more than 12 items");
  }
  if (input.keyFeatures?.some((feature) => feature.length > 160)) {
    errors.push("each keyFeature must be 160 characters or less");
  }
  if (input.excludeHooks && input.excludeHooks.length > 20) {
    errors.push("excludeHooks cannot include more than 20 items");
  }
  if (input.excludeHooks?.some((hook) => hook.length > 240)) {
    errors.push("each excludeHook must be 240 characters or less");
  }

  return errors;
}

function formatCampaignLabel(campaignType: CampaignType): string {
  return campaignType
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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
    const pipeline = searchParams.get("pipeline") ?? "heygen";
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
    const offset = Number(searchParams.get("offset") ?? 0);

    if (!VALID_PIPELINES.includes(pipeline as VideoPipeline)) {
      return NextResponse.json(
        { error: `pipeline must be one of: ${VALID_PIPELINES.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient();

    let query = supabase
      .from("video_scripts")
      .select("*", { count: "exact" })
      .eq("pipeline", pipeline)
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
