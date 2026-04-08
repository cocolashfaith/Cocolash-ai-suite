import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateVideoScript } from "@/lib/openrouter/captions";
import { createSeedanceTask } from "@/lib/seedance/client";
import {
  buildSeedanceVideoPrompt,
  buildSeedanceVideoPromptWithAudio,
} from "@/lib/seedance/video-prompt";
import { SEEDANCE_COSTS } from "@/lib/seedance/types";
import type { SeedanceAspectRatio, SeedanceDuration } from "@/lib/seedance/types";
import type { UGCScene, UGCVibe } from "@/lib/seedance/ugc-image-prompt";
import type { CampaignType, ScriptTone, VideoDuration } from "@/lib/types";

export const maxDuration = 300;

const VALID_CAMPAIGN_TYPES: CampaignType[] = [
  "product-showcase", "testimonial", "promo",
  "educational", "unboxing", "before-after",
];
const VALID_TONES: ScriptTone[] = ["casual", "energetic", "calm", "professional"];
const VALID_DURATIONS: VideoDuration[] = [15, 30, 60];
const VALID_ASPECT_RATIOS: SeedanceAspectRatio[] = ["9:16", "1:1", "16:9"];
const VALID_AUDIO_MODES = ["script-in-prompt", "uploaded-audio"] as const;

interface SeedanceGenerateBody {
  personImageUrl: string;
  productImageUrl: string;
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: VideoDuration;
  scriptId?: string;
  scriptText?: string;
  audioMode: "script-in-prompt" | "uploaded-audio";
  audioUrl?: string;
  aspectRatio: SeedanceAspectRatio;
  fixedLens?: boolean;
  generateAudio?: boolean;
  scene: UGCScene;
  vibe: UGCVibe;
  personDescription: string;
}

/**
 * POST /api/seedance/generate
 *
 * Seedance 2.0 video generation pipeline:
 * 1. Validate input
 * 2. Resolve or generate script
 * 3. Build Seedance prompt (script-in-prompt or audio mode)
 * 4. Create DB record (pipeline: 'seedance')
 * 5. Submit task to Kie.ai
 * 6. Update DB with taskId
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SeedanceGenerateBody>;

    const errors = validateRequest(body);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const {
      personImageUrl,
      productImageUrl,
      campaignType,
      tone,
      duration,
      scriptId,
      audioMode,
      audioUrl,
      aspectRatio,
      fixedLens = false,
      generateAudio = true,
      scene,
      vibe,
      personDescription,
    } = body as SeedanceGenerateBody;

    const supabase = await createAdminClient();

    // ── Step 1: Resolve script ───────────────────────────────
    let scriptText: string = body.scriptText ?? "";
    let scriptDbId: string | null = scriptId ?? null;

    if (scriptId) {
      const { data: existingScript, error: scriptError } = await supabase
        .from("video_scripts")
        .select("script_text")
        .eq("id", scriptId)
        .single();

      if (scriptError || !existingScript) {
        return NextResponse.json({ error: "Script not found" }, { status: 404 });
      }
      scriptText = existingScript.script_text;
    } else if (!scriptText && audioMode === "script-in-prompt") {
      const scripts = await generateVideoScript({
        campaignType: campaignType!,
        tone: tone!,
        duration: duration!,
      });

      const bestScript = scripts[0];
      scriptText = bestScript.full_script;

      const { data: savedScript } = await supabase
        .from("video_scripts")
        .insert({
          title: `Seedance — ${campaignType} — ${tone} — ${duration}s`,
          campaign_type: campaignType,
          tone,
          duration_seconds: duration,
          script_text: bestScript.full_script,
          hook_text: bestScript.hook,
          cta_text: bestScript.cta,
          is_template: false,
        })
        .select("id")
        .single();

      scriptDbId = savedScript?.id ?? null;
    }

    // ── Step 2: Build Seedance prompt ────────────────────────
    let seedancePrompt: string;

    if (audioMode === "uploaded-audio") {
      seedancePrompt = buildSeedanceVideoPromptWithAudio({
        campaignType,
        personDescription,
        productDescription: productImageUrl,
        scene,
        vibe,
        duration,
      });
    } else {
      seedancePrompt = buildSeedanceVideoPrompt({
        campaignType,
        scriptText,
        personDescription,
        productDescription: productImageUrl,
        scene,
        vibe,
        duration,
      });
    }

    // ── Step 3: Create DB record ─────────────────────────────
    const seedanceDuration = String(
      duration <= 5 ? 5 : duration <= 8 ? 8 : duration <= 10 ? 10 : 15
    ) as SeedanceDuration;

    const { data: videoRecord, error: insertError } = await supabase
      .from("generated_videos")
      .insert({
        script_id: scriptDbId,
        person_image_url: personImageUrl,
        product_image_url: productImageUrl,
        heygen_status: "pending",
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        has_captions: false,
        has_watermark: false,
        has_background_music: false,
        pipeline: "seedance",
        seedance_task_id: null,
        seedance_prompt: seedancePrompt,
        audio_mode: audioMode,
        audio_url: audioUrl ?? null,
      })
      .select("id")
      .single();

    if (insertError || !videoRecord) {
      console.error("[seedance/generate] DB insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create video record" },
        { status: 500 }
      );
    }

    const videoId = videoRecord.id;

    // ── Step 4: Submit to Kie.ai ─────────────────────────────
    try {
      const referenceImageUrls = [productImageUrl];
      const referenceAudioUrls =
        audioMode === "uploaded-audio" && audioUrl ? [audioUrl] : undefined;

      const taskId = await createSeedanceTask({
        prompt: seedancePrompt,
        first_frame_url: personImageUrl,
        reference_image_urls: referenceImageUrls,
        ...(referenceAudioUrls && { reference_audio_urls: referenceAudioUrls }),
        aspect_ratio: aspectRatio,
        resolution: "720p",
        duration: seedanceDuration,
        fixed_lens: fixedLens,
        generate_audio: generateAudio,
      });

      // ── Step 5: Update DB with taskId ──────────────────────
      await supabase
        .from("generated_videos")
        .update({
          seedance_task_id: taskId,
          heygen_status: "processing",
        })
        .eq("id", videoId);

      const durationNum = parseInt(seedanceDuration, 10);
      const estimatedCost =
        durationNum * SEEDANCE_COSTS.COST_PER_SECOND_720P_NO_VIDEO +
        SEEDANCE_COSTS.SCRIPT_GENERATION +
        SEEDANCE_COSTS.IMAGE_GENERATION +
        SEEDANCE_COSTS.POST_PROCESSING;

      return NextResponse.json({
        videoId,
        taskId,
        status: "pending",
        estimatedCost: Number(estimatedCost.toFixed(3)),
      });
    } catch (submitError) {
      console.error("[seedance/generate] Kie.ai submit error:", submitError);
      await supabase
        .from("generated_videos")
        .update({ heygen_status: "failed" })
        .eq("id", videoId);

      return NextResponse.json(
        {
          error: `Seedance video generation failed: ${submitError instanceof Error ? submitError.message : "Unknown error"}`,
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("[seedance/generate] Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Video generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function validateRequest(body: Partial<SeedanceGenerateBody>): string[] {
  const errors: string[] = [];

  if (!body.personImageUrl) errors.push("personImageUrl is required");
  if (!body.productImageUrl) errors.push("productImageUrl is required");
  if (!body.personDescription) errors.push("personDescription is required");
  if (!body.scene) errors.push("scene is required");
  if (!body.vibe) errors.push("vibe is required");

  if (!body.campaignType || !VALID_CAMPAIGN_TYPES.includes(body.campaignType)) {
    errors.push(`campaignType must be one of: ${VALID_CAMPAIGN_TYPES.join(", ")}`);
  }
  if (!body.tone || !VALID_TONES.includes(body.tone)) {
    errors.push(`tone must be one of: ${VALID_TONES.join(", ")}`);
  }
  if (!body.duration || !VALID_DURATIONS.includes(body.duration)) {
    errors.push(`duration must be one of: ${VALID_DURATIONS.join(", ")}`);
  }
  if (!body.aspectRatio || !VALID_ASPECT_RATIOS.includes(body.aspectRatio)) {
    errors.push(`aspectRatio must be one of: ${VALID_ASPECT_RATIOS.join(", ")}`);
  }
  if (
    !body.audioMode ||
    !VALID_AUDIO_MODES.includes(body.audioMode as (typeof VALID_AUDIO_MODES)[number])
  ) {
    errors.push(`audioMode must be one of: ${VALID_AUDIO_MODES.join(", ")}`);
  }

  if (body.audioMode === "script-in-prompt" && !body.scriptId && !body.scriptText) {
    // Script will be auto-generated, which is fine
  }

  if (body.audioMode === "uploaded-audio" && !body.audioUrl) {
    errors.push("audioUrl is required when audioMode is 'uploaded-audio'");
  }

  return errors;
}
