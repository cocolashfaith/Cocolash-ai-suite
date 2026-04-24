import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient, getCurrentUserId } from "@/lib/supabase/server";
import { generateVideoScript } from "@/lib/openrouter/captions";
import { composePersonWithProduct } from "@/lib/gemini/composition";
import { createPhotoAvatar, generateVideo, uploadAudioAsset } from "@/lib/heygen/client";
import { VIDEO_DIMENSIONS } from "@/lib/heygen/types";
import { synthesizeToAudio, alignmentToSRT } from "@/lib/elevenlabs/client";
import {
  buildMinimalSelectionsForVideoAsset,
  getDefaultBrandId,
  insertVideoGalleryAsset,
  videoAspectToImageAspect,
} from "@/lib/video/insert-gallery-asset";
import type {
  CampaignType,
  CompositionPose,
  ScriptTone,
  VideoDuration,
  VideoAspectRatio,
  VideoGenerateRequest,
  VideoGenerateResponse,
} from "@/lib/types";

export const maxDuration = 300;

const VALID_CAMPAIGN_TYPES: CampaignType[] = [
  "product-showcase", "testimonial", "promo",
  "educational", "unboxing", "before-after",
  "brand-story", "faq", "myths", "product-knowledge",
];
const VALID_TONES: ScriptTone[] = ["casual", "energetic", "calm", "professional"];
const VALID_DURATIONS: VideoDuration[] = [15, 30, 60, 90];
const VALID_ASPECT_RATIOS: VideoAspectRatio[] = ["9:16", "1:1", "16:9"];
const VALID_POSES: CompositionPose[] = ["holding", "applying", "selfie", "testimonial"];

/**
 * POST /api/videos/generate
 *
 * Full video generation pipeline:
 * 1. Generate or fetch script
 * 2. Get person image (from generated_images or provided URL)
 * 3. Compose person + product via Gemini (preserving original background)
 * 4. Create photo avatar via HeyGen (Upload Asset → Avatar Group → talking_photo_id)
 * 5. Submit video generation to HeyGen with Avatar IV engine
 * 6. Create DB record and return video ID for status polling
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<VideoGenerateRequest> & { action?: string };

    // ── Compose-only preview ─────────────────────────────────
    if (body.action === "compose-only") {
      return handleComposeOnly(body);
    }

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
      composedImageUrl: precomposedUrl,
    } = body as VideoGenerateRequest;

    const clientScriptText = typeof (body as Record<string, unknown>).scriptText === "string"
      ? ((body as Record<string, unknown>).scriptText as string).trim()
      : null;

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
    } else if (clientScriptText) {
      // Use the script text selected by the user in the wizard
      scriptText = clientScriptText;

      const { data: savedScript } = await supabase
        .from("video_scripts")
        .insert({
          title: `${campaignType} — ${tone} — ${duration}s`,
          campaign_type: campaignType,
          tone,
          duration_seconds: duration,
          script_text: scriptText,
          is_template: false,
        })
        .select("id")
        .single();

      scriptDbId = savedScript?.id ?? null;
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

    // ── Step 3: Compose person + product (or skip for educational) ─
    let composedImageUrl: string;
    const trimmedPre = precomposedUrl?.trim();
    if (trimmedPre) {
      composedImageUrl = trimmedPre;
    } else if (productImageUrl && pose) {
      try {
        const composeResult = await composePersonWithProduct({
          personImageUrl: resolvedPersonUrl,
          productImageUrl,
          pose,
          brandId: "cocolash",
          outputAspectRatio: videoAspectToImageAspect(aspectRatio!),
        });
        composedImageUrl = composeResult.composedImageUrl;
      } catch (composeError) {
        console.error("[videos/generate] Composition error:", composeError);
        return NextResponse.json(
          { error: `Image composition failed: ${composeError instanceof Error ? composeError.message : "Unknown error"}` },
          { status: 500 }
        );
      }
    } else {
      composedImageUrl = resolvedPersonUrl;
    }

    // ── Step 4: Create DB record (status: pending) ──────────
    const { data: videoRecord, error: insertError } = await supabase
      .from("generated_videos")
      .insert({
        script_id: scriptDbId,
        person_image_id: personImageId ?? null,
        person_image_url: resolvedPersonUrl,
        product_image_url: productImageUrl ?? null,
        composed_image_url: composedImageUrl,
        heygen_status: "pending",
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        has_captions: true,
        has_watermark: false,
        has_background_music: false,
        voice_id: voiceId,
        background_type: campaignType ?? null,
        background_value: null,
        script_text_cache: scriptText,
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

    // ── Step 5: Create photo avatar via HeyGen ──────────────
    let talkingPhotoId: string;
    try {
      const photoAvatar = await createPhotoAvatar(
        composedImageUrl,
        `CocoLash — ${campaignType} — ${new Date().toISOString().slice(0, 10)}`
      );
      talkingPhotoId = photoAvatar.talking_photo_id;

      await supabase
        .from("generated_videos")
        .update({ avatar_image_url: photoAvatar.avatar_url ?? composedImageUrl })
        .eq("id", videoId);
    } catch (uploadError) {
      console.error("[videos/generate] HeyGen photo avatar error:", uploadError);
      await supabase
        .from("generated_videos")
        .update({ heygen_status: "failed" })
        .eq("id", videoId);

      return NextResponse.json(
        { error: `Failed to create photo avatar on HeyGen: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}` },
        { status: 500 }
      );
    }

    // ── Step 6: Synthesize TTS via ElevenLabs + submit to HeyGen ─
    try {
      const dimension = VIDEO_DIMENSIONS[aspectRatio!] ?? VIDEO_DIMENSIONS["9:16"];

      let voiceConfig: import("@/lib/heygen/types").VideoGenVoice;
      let captionSrt: string | null = null;

      if (process.env.ELEVENLABS_API_KEY) {
        const ttsResult = await synthesizeToAudio(voiceId!, scriptText);
        const audioAssetId = await uploadAudioAsset(ttsResult.audioBuffer);
        voiceConfig = { type: "audio", audio_asset_id: audioAssetId };

        if (ttsResult.alignment) {
          captionSrt = alignmentToSRT(ttsResult.alignment);
          console.log(`[videos/generate] Generated SRT from ElevenLabs alignment (${captionSrt.length} chars)`);
        }
      } else {
        voiceConfig = { type: "text", voice_id: voiceId!, input_text: scriptText };
      }

      const heygenResult = await generateVideo({
        video_inputs: [
          {
            character: {
              type: "talking_photo",
              talking_photo_id: talkingPhotoId,
              talking_style: "expressive",
              expression: "happy",
              matting: false,
              use_avatar_iv_model: true,
            },
            voice: voiceConfig,
          },
        ],
        dimension,
        caption: false,
        title: `CocoLash — ${campaignType} — ${duration}s`,
      });

      await supabase
        .from("generated_videos")
        .update({
          heygen_video_id: heygenResult.video_id,
          heygen_status: "processing",
          ...(captionSrt ? { caption_srt: captionSrt } : {}),
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

// ── Compose-Only Handler ─────────────────────────────────────

async function handleComposeOnly(
  body: Partial<VideoGenerateRequest> & {
    action?: string;
    saveToGallery?: boolean;
  }
) {
  if (!body.personImageUrl) {
    return NextResponse.json({ error: "personImageUrl is required" }, { status: 400 });
  }
  if (!body.productImageUrl) {
    return NextResponse.json({ error: "productImageUrl is required" }, { status: 400 });
  }

  const pose = body.pose ?? "holding";
  const aspectRatio = body.aspectRatio ?? "9:16";

  try {
    const result = await composePersonWithProduct({
      personImageUrl: body.personImageUrl,
      productImageUrl: body.productImageUrl,
      pose,
      brandId: "cocolash",
      outputAspectRatio: videoAspectToImageAspect(aspectRatio),
    });

    let galleryImageId: string | undefined;

    if (body.saveToGallery) {
      const userSupabase = await createClient();
      const userId = await getCurrentUserId(userSupabase);
      const admin = await createAdminClient();
      const brandId = await getDefaultBrandId(admin);
      if (brandId) {
        const imageAspect = videoAspectToImageAspect(aspectRatio);
        const selections = buildMinimalSelectionsForVideoAsset({
          aspectRatio: imageAspect,
          lashStyle: "natural",
          heygenAsset: {
            kind: "heygen-composition",
            personImageUrl: body.personImageUrl,
            productImageUrl: body.productImageUrl,
            pose,
          },
        });
        const inserted = await insertVideoGalleryAsset({
          supabase: admin,
          userId,
          brandId,
          imageUrl: result.composedImageUrl,
          storagePath: result.storagePath,
          aspectRatio: imageAspect,
          promptUsed: `[HeyGen composition preview] pose=${pose}`,
          selections,
          tags: ["heygen-composition"],
          geminiModel: "gemini-composition",
        });
        galleryImageId = inserted?.id;
      }
    }

    return NextResponse.json({
      success: true,
      composedImageUrl: result.composedImageUrl,
      storagePath: result.storagePath,
      galleryImageId,
    });
  } catch (error) {
    console.error("[videos/generate] Compose-only error:", error);
    return NextResponse.json(
      {
        error: `Composition failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
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

  if (body.pose && !VALID_POSES.includes(body.pose)) {
    errors.push(`pose must be one of: ${VALID_POSES.join(", ")}`);
  }
  if (!body.voiceId) {
    errors.push("voiceId is required");
  }
  if (!body.aspectRatio || !VALID_ASPECT_RATIOS.includes(body.aspectRatio)) {
    errors.push(`aspectRatio must be one of: ${VALID_ASPECT_RATIOS.join(", ")}`);
  }

  return errors;
}
