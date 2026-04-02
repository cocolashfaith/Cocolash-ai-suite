import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateVideoScript } from "@/lib/openrouter/captions";
import { composePersonWithProduct } from "@/lib/gemini/composition";
import { uploadTalkingPhoto, generateVideo } from "@/lib/heygen/client";
import { VIDEO_DIMENSIONS } from "@/lib/heygen/types";
import type {
  CampaignType,
  ScriptTone,
  VideoDuration,
  VideoAspectRatio,
  VideoBackgroundType,
  CompositionPose,
  VideoGenerateRequest,
  VideoGenerateResponse,
} from "@/lib/types";

export const maxDuration = 300;

const VALID_CAMPAIGN_TYPES: CampaignType[] = [
  "product-showcase", "testimonial", "promo",
  "educational", "unboxing", "before-after",
];
const VALID_TONES: ScriptTone[] = ["casual", "energetic", "calm", "professional"];
const VALID_DURATIONS: VideoDuration[] = [15, 30, 60];
const VALID_ASPECT_RATIOS: VideoAspectRatio[] = ["9:16", "1:1", "16:9"];
const VALID_BG_TYPES: VideoBackgroundType[] = ["solid", "gradient", "image"];
const VALID_POSES: CompositionPose[] = ["holding", "applying", "selfie", "testimonial"];

/**
 * POST /api/videos/generate
 *
 * Full video generation pipeline:
 * 1. Generate or fetch script
 * 2. Get person image (from generated_images or provided URL)
 * 3. Compose person + product via Gemini
 * 4. Upload composed image to HeyGen as talking photo
 * 5. Submit video generation to HeyGen
 * 6. Create DB record and return video ID for status polling
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<VideoGenerateRequest>;

    // ── Validate required fields ─────────────────────────────
    const errors = validateRequest(body);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors.join("; ") },
        { status: 400 }
      );
    }

    const {
      scriptId,
      campaignType,
      tone,
      duration,
      personImageId,
      personImageUrl,
      productImageUrl,
      pose,
      voiceId,
      aspectRatio,
      backgroundType,
      backgroundValue,
      addCaptions,
      addWatermark,
    } = body as VideoGenerateRequest;

    const supabase = await createAdminClient();

    // ── Step 1: Get or generate script ───────────────────────
    let scriptText: string;
    let scriptDbId: string | null = scriptId ?? null;

    if (scriptId) {
      const { data: existingScript, error: scriptError } = await supabase
        .from("video_scripts")
        .select("script_text")
        .eq("id", scriptId)
        .single();

      if (scriptError || !existingScript) {
        return NextResponse.json(
          { error: "Script not found" },
          { status: 404 }
        );
      }
      scriptText = existingScript.script_text;
    } else {
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
          title: `Auto — ${campaignType} — ${tone} — ${duration}s`,
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

    // ── Step 2: Resolve person image URL ─────────────────────
    let resolvedPersonUrl: string | null = personImageUrl ?? null;

    if (personImageId && !resolvedPersonUrl) {
      const { data: personImage } = await supabase
        .from("generated_images")
        .select("image_url")
        .eq("id", personImageId)
        .single();

      if (personImage?.image_url) {
        resolvedPersonUrl = personImage.image_url;
      }
    }

    if (!resolvedPersonUrl) {
      return NextResponse.json(
        { error: "A person image is required (personImageUrl or personImageId)" },
        { status: 400 }
      );
    }

    // ── Step 3: Compose person + product via Gemini ──────────
    let composedImageUrl: string;
    try {
      const composeResult = await composePersonWithProduct({
        personImageUrl: resolvedPersonUrl,
        productImageUrl: productImageUrl!,
        pose: pose!,
        brandId: "cocolash",
      });
      composedImageUrl = composeResult.composedImageUrl;
    } catch (composeError) {
      console.error("[videos/generate] Composition error:", composeError);
      return NextResponse.json(
        { error: `Image composition failed: ${composeError instanceof Error ? composeError.message : "Unknown error"}` },
        { status: 500 }
      );
    }

    // ── Step 4: Create DB record (status: pending) ──────────
    const { data: videoRecord, error: insertError } = await supabase
      .from("generated_videos")
      .insert({
        script_id: scriptDbId,
        person_image_id: personImageId ?? null,
        person_image_url: resolvedPersonUrl,
        product_image_url: productImageUrl,
        composed_image_url: composedImageUrl,
        heygen_status: "pending",
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        has_captions: addCaptions ?? false,
        has_watermark: addWatermark ?? false,
        has_background_music: false,
        voice_id: voiceId,
        background_type: backgroundType,
        background_value: backgroundValue,
      })
      .select("id")
      .single();

    if (insertError || !videoRecord) {
      console.error("[videos/generate] DB insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create video record" },
        { status: 500 }
      );
    }

    const videoId = videoRecord.id;

    // ── Step 5: Upload composed image to HeyGen as talking photo
    let talkingPhotoId: string;
    try {
      const talkingPhoto = await uploadTalkingPhoto(composedImageUrl);
      talkingPhotoId = talkingPhoto.talking_photo_id;

      await supabase
        .from("generated_videos")
        .update({ avatar_image_url: talkingPhoto.talking_photo_url ?? composedImageUrl })
        .eq("id", videoId);
    } catch (uploadError) {
      console.error("[videos/generate] HeyGen upload error:", uploadError);
      await supabase
        .from("generated_videos")
        .update({ heygen_status: "failed" })
        .eq("id", videoId);

      return NextResponse.json(
        { error: `Failed to upload avatar to HeyGen: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}` },
        { status: 500 }
      );
    }

    // ── Step 6: Submit video generation to HeyGen ───────────
    try {
      const dimension = VIDEO_DIMENSIONS[aspectRatio!] ?? VIDEO_DIMENSIONS["9:16"];

      const background = buildBackground(backgroundType!, backgroundValue!);

      const heygenResult = await generateVideo({
        video_inputs: [
          {
            character: {
              type: "talking_photo",
              talking_photo_id: talkingPhotoId,
              talking_style: "stable",
              expression: "happy",
            },
            voice: {
              type: "text",
              voice_id: voiceId!,
              input_text: scriptText,
            },
            background,
          },
        ],
        dimension,
        caption: addCaptions ?? false,
        title: `CocoLash — ${campaignType} — ${duration}s`,
      });

      await supabase
        .from("generated_videos")
        .update({
          heygen_video_id: heygenResult.video_id,
          heygen_status: "processing",
        })
        .eq("id", videoId);

      const response: VideoGenerateResponse = {
        success: true,
        videoId,
        status: "processing",
        estimatedTime: "3-5 minutes",
      };

      return NextResponse.json(response);
    } catch (heygenError) {
      console.error("[videos/generate] HeyGen submit error:", heygenError);
      await supabase
        .from("generated_videos")
        .update({ heygen_status: "failed" })
        .eq("id", videoId);

      return NextResponse.json(
        { error: `HeyGen video generation failed: ${heygenError instanceof Error ? heygenError.message : "Unknown error"}` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("[videos/generate] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Video generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────

function validateRequest(body: Partial<VideoGenerateRequest>): string[] {
  const errors: string[] = [];

  if (!body.scriptId) {
    if (!body.campaignType || !VALID_CAMPAIGN_TYPES.includes(body.campaignType)) {
      errors.push(`campaignType must be one of: ${VALID_CAMPAIGN_TYPES.join(", ")}`);
    }
    if (!body.tone || !VALID_TONES.includes(body.tone)) {
      errors.push(`tone must be one of: ${VALID_TONES.join(", ")}`);
    }
    if (!body.duration || !VALID_DURATIONS.includes(body.duration)) {
      errors.push(`duration must be one of: ${VALID_DURATIONS.join(", ")}`);
    }
  }

  if (!body.productImageUrl) {
    errors.push("productImageUrl is required");
  }
  if (!body.pose || !VALID_POSES.includes(body.pose)) {
    errors.push(`pose must be one of: ${VALID_POSES.join(", ")}`);
  }
  if (!body.voiceId) {
    errors.push("voiceId is required");
  }
  if (!body.aspectRatio || !VALID_ASPECT_RATIOS.includes(body.aspectRatio)) {
    errors.push(`aspectRatio must be one of: ${VALID_ASPECT_RATIOS.join(", ")}`);
  }
  if (!body.backgroundType || !VALID_BG_TYPES.includes(body.backgroundType)) {
    errors.push(`backgroundType must be one of: ${VALID_BG_TYPES.join(", ")}`);
  }
  if (!body.backgroundValue) {
    errors.push("backgroundValue is required");
  }

  return errors;
}

function buildBackground(
  type: VideoBackgroundType,
  value: string
): { type: "color"; value: string } | { type: "image"; url: string } {
  if (type === "image") {
    return { type: "image", url: value };
  }
  return { type: "color", value };
}
