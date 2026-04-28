import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateVideoScript } from "@/lib/openrouter/captions";
import { createSeedanceTask } from "@/lib/seedance/client";
import {
  buildSeedanceDirectorPromptFallback,
  generateSeedanceDirectorPrompt,
  type SeedanceDirectorPromptParams,
} from "@/lib/seedance/prompt-planner";
import { SEEDANCE_COSTS } from "@/lib/seedance/types";
import type {
  SeedanceAspectRatio,
  SeedanceDuration,
  SeedanceGenerationType,
  SeedanceMode,
  SeedanceMultiFramePrompt,
  SeedanceResolution,
} from "@/lib/seedance/types";
import type { UGCScene, UGCVibe } from "@/lib/seedance/ugc-image-prompt";
import type { CampaignType, ScriptTone, VideoDuration } from "@/lib/types";

export const maxDuration = 300;

const VALID_CAMPAIGN_TYPES: CampaignType[] = [
  "product-showcase", "testimonial", "promo",
  "educational", "unboxing", "before-after",
];
const VALID_TONES: ScriptTone[] = ["casual", "energetic", "calm", "professional"];
const VALID_DURATIONS: VideoDuration[] = [15, 30, 60];
const VALID_ASPECT_RATIOS: SeedanceAspectRatio[] = [
  "9:16", "1:1", "16:9", "4:3", "3:4", "21:9",
];
const VALID_SEEDANCE_DURATIONS: SeedanceDuration[] = ["5", "8", "10", "15"];
const VALID_RESOLUTIONS: SeedanceResolution[] = ["480p", "720p", "1080p"];
const VALID_GENERATION_TYPES: SeedanceGenerationType[] = ["text-to-video", "image-to-video"];
const VALID_SEEDANCE_MODES: SeedanceMode[] = [
  "ugc", "multi_reference", "multi_frame", "lipsyncing", "first_n_last_frames",
];
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
  seedanceDuration?: SeedanceDuration;
  resolution?: SeedanceResolution;
  generationType?: SeedanceGenerationType;
  seedanceMode?: SeedanceMode;
  fullAccess?: boolean;
  fastMode?: boolean;
  products?: string[];
  influencers?: string[];
  images?: string[];
  videos?: string[];
  audios?: string[];
  firstFrameImage?: string;
  lastFrameImage?: string;
  lipsyncingAudio?: string;
  multiFramePrompts?: SeedanceMultiFramePrompt[];
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
 * 5. Submit request to Enhancor.ai
 * 6. Update DB with requestId
 */
export async function POST(request: NextRequest) {
  try {
    let body: Partial<SeedanceGenerateBody>;
    try {
      body = (await request.json()) as Partial<SeedanceGenerateBody>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

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
      seedanceDuration: requestedSeedanceDuration,
      resolution = "720p",
      generationType = "image-to-video",
      seedanceMode = "ugc",
      fullAccess = true,
      fastMode = false,
      products,
      influencers,
      images,
      videos,
      audios,
      firstFrameImage,
      lastFrameImage,
      lipsyncingAudio,
      multiFramePrompts,
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
        .eq("pipeline", "seedance")
        .single();

      if (scriptError || !existingScript) {
        return NextResponse.json({ error: "Script not found" }, { status: 404 });
      }
      scriptText = existingScript.script_text;
    } else if (!scriptText) {
      // Even uploaded-audio videos need a transcript-like spoken script so the
      // director prompt can plan lip movement, gestures, and timing around it.
      const scripts = await generateVideoScript({
        campaignType: campaignType!,
        tone: tone!,
        duration: duration!,
        pipeline: "seedance",
      });

      const bestScript = scripts[0];
      scriptText = bestScript.full_script;

      const { data: savedScript } = await supabase
        .from("video_scripts")
        .insert({
          title: `Seedance — ${campaignType} — ${tone} — ${duration}s`,
          pipeline: "seedance",
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

    const seedanceDuration =
      requestedSeedanceDuration ??
      (String(duration <= 5 ? 5 : duration <= 8 ? 8 : duration <= 10 ? 10 : 15) as SeedanceDuration);

    // ── Step 2: Build Seedance director prompt ───────────────
    const promptMode: SeedanceDirectorPromptParams["mode"] =
      generationType === "text-to-video" ? "text-to-video" : seedanceMode;
    const promptPlannerParams: SeedanceDirectorPromptParams = {
      campaignType,
      scriptText,
      personDescription,
      productDescription: productImageUrl,
      scene,
      vibe,
      duration: parseInt(seedanceDuration, 10),
      aspectRatio,
      mode: promptMode,
      audioMode,
      hasProductReference:
        generationType !== "text-to-video" &&
        (Boolean(productImageUrl) || Boolean(products?.length) || Boolean(images?.length)),
      hasCharacterReference:
        generationType !== "text-to-video" &&
        (Boolean(personImageUrl) || Boolean(influencers?.length) || Boolean(images?.length)),
      hasAudioReference: Boolean(audioUrl || audios?.length || lipsyncingAudio),
      hasVideoReference: Boolean(videos?.length),
    };

    let seedancePrompt: string;
    try {
      seedancePrompt = await generateSeedanceDirectorPrompt(promptPlannerParams);
    } catch (promptError) {
      console.error("[seedance/generate] Prompt planner failed, using fallback:", promptError);
      seedancePrompt = buildSeedanceDirectorPromptFallback(promptPlannerParams);
    }

    // ── Step 3: Create DB record ─────────────────────────────

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

    // ── Step 4: Submit to Enhancor.ai ────────────────────────
    try {
      const referenceImageUrls = [productImageUrl];
      const referenceAudioUrls =
        audioMode === "uploaded-audio" && audioUrl ? [audioUrl] : undefined;
      const resolvedProducts =
        products && products.length > 0 ? products : [productImageUrl];
      const resolvedInfluencers =
        influencers && influencers.length > 0 ? influencers : [personImageUrl];
      const resolvedImages =
        images && images.length > 0 ? images : [personImageUrl, productImageUrl].filter(Boolean);
      const resolvedAudios =
        audios && audios.length > 0
          ? audios
          : referenceAudioUrls ?? [];

      const taskId = await createSeedanceTask(
        {
          type: generationType,
          mode: seedanceMode,
          prompt: seedancePrompt,
          first_frame_url: personImageUrl,
          first_frame_image: firstFrameImage || personImageUrl,
          ...(lastFrameImage && { last_frame_image: lastFrameImage }),
          reference_image_urls: referenceImageUrls,
          ...(referenceAudioUrls && { reference_audio_urls: referenceAudioUrls }),
          products: resolvedProducts,
          influencers: resolvedInfluencers,
          images: resolvedImages,
          videos: videos ?? [],
          audios: resolvedAudios,
          ...(lipsyncingAudio && { lipsyncing_audio: lipsyncingAudio }),
          ...(multiFramePrompts && { multi_frame_prompts: multiFramePrompts }),
          aspect_ratio: aspectRatio,
          resolution,
          duration: seedanceDuration,
          full_access: fullAccess,
          fast_mode: fastMode,
          fixed_lens: fixedLens,
          generate_audio: generateAudio,
        },
        getEnhancorWebhookUrl()
      );

      // ── Step 5: Update DB with requestId ───────────────────
      await supabase
        .from("generated_videos")
        .update({
          seedance_task_id: taskId,
          heygen_status: "processing",
        })
        .eq("id", videoId);

      const durationNum = parseInt(seedanceDuration, 10);
      const videoCostPerSecond =
        resolution === "1080p"
          ? SEEDANCE_COSTS.COST_PER_SECOND_1080P_NO_VIDEO
          : SEEDANCE_COSTS.COST_PER_SECOND_720P_NO_VIDEO;
      const estimatedCost =
        durationNum * videoCostPerSecond +
        SEEDANCE_COSTS.SCRIPT_GENERATION +
        SEEDANCE_COSTS.IMAGE_GENERATION +
        SEEDANCE_COSTS.POST_PROCESSING;

      return NextResponse.json({
        videoId,
        taskId,
        status: "processing",
        estimatedCost: Number(estimatedCost.toFixed(3)),
      });
    } catch (submitError) {
      console.error("[seedance/generate] Enhancor submit error:", submitError);
      await supabase
        .from("generated_videos")
        .update({ heygen_status: "failed" })
        .eq("id", videoId);

      return NextResponse.json(
        {
          error: "Seedance video generation failed. Please try again.",
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("[seedance/generate] Unexpected error:", error);
    return NextResponse.json(
      { error: "Video generation failed. Please try again." },
      { status: 500 }
    );
  }
}

function validateRequest(body: Partial<SeedanceGenerateBody>): string[] {
  const errors: string[] = [];

  if (!body.personImageUrl) errors.push("personImageUrl is required");
  if (!body.productImageUrl) errors.push("productImageUrl is required");
  if (!body.personDescription) errors.push("personDescription is required");
  if (body.personDescription && body.personDescription.length > 800) {
    errors.push("personDescription must be 800 characters or less");
  }
  if (body.scriptText && body.scriptText.length > 2500) {
    errors.push("scriptText must be 2500 characters or less");
  }
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
    body.seedanceDuration &&
    !VALID_SEEDANCE_DURATIONS.includes(body.seedanceDuration)
  ) {
    errors.push(`seedanceDuration must be one of: ${VALID_SEEDANCE_DURATIONS.join(", ")}`);
  }
  if (body.resolution && !VALID_RESOLUTIONS.includes(body.resolution)) {
    errors.push(`resolution must be one of: ${VALID_RESOLUTIONS.join(", ")}`);
  }
  if (
    body.resolution === "1080p" &&
    body.aspectRatio &&
    VALID_ASPECT_RATIOS.includes(body.aspectRatio) &&
    body.aspectRatio !== "16:9"
  ) {
    errors.push("1080p resolution is only supported with 16:9 aspect ratio");
  }
  if (body.resolution === "1080p" && body.fastMode) {
    errors.push("1080p resolution requires fastMode to be disabled");
  }
  if (
    body.generationType &&
    !VALID_GENERATION_TYPES.includes(body.generationType)
  ) {
    errors.push(`generationType must be one of: ${VALID_GENERATION_TYPES.join(", ")}`);
  }
  if (body.seedanceMode && !VALID_SEEDANCE_MODES.includes(body.seedanceMode)) {
    errors.push(`seedanceMode must be one of: ${VALID_SEEDANCE_MODES.join(", ")}`);
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
  if (
    body.seedanceMode === "multi_frame" &&
    (!body.multiFramePrompts || body.multiFramePrompts.length === 0)
  ) {
    errors.push("multiFramePrompts is required for multi_frame mode");
  }
  if (body.seedanceMode === "multi_frame" && body.multiFramePrompts) {
    const totalDuration = body.multiFramePrompts.reduce(
      (sum, item) => sum + item.duration,
      0
    );
    if (totalDuration < 4 || totalDuration > 15) {
      errors.push("multiFramePrompts total duration must be between 4 and 15 seconds");
    }
  }
  if (
    body.seedanceMode === "first_n_last_frames" &&
    !body.firstFrameImage &&
    !body.personImageUrl
  ) {
    errors.push("firstFrameImage or personImageUrl is required for first_n_last_frames mode");
  }
  if (
    body.seedanceMode === "lipsyncing" &&
    !body.lipsyncingAudio &&
    !body.audioUrl &&
    (!body.audios || body.audios.length === 0)
  ) {
    errors.push("audioUrl, lipsyncingAudio, or audios is required for lipsyncing mode");
  }
  const unsafeUrls = collectMediaUrls(body).filter((url) => !isSafePublicHttpsUrl(url));
  if (unsafeUrls.length > 0) {
    errors.push("All media URLs must be public HTTPS URLs");
  }

  return errors;
}

function getEnhancorWebhookUrl(): string {
  const configuredUrl = process.env.ENHANCOR_WEBHOOK_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl && !appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is required to build the Enhancor webhook URL");
  }

  const webhookUrl =
    configuredUrl ??
    `${appUrl!.replace(/\/$/, "")}/api/seedance/webhook`;
  const secret = process.env.ENHANCOR_WEBHOOK_SECRET;

  if (!secret) {
    return webhookUrl;
  }

  const url = new URL(webhookUrl);
  url.searchParams.set("token", secret);
  return url.toString();
}

function collectMediaUrls(body: Partial<SeedanceGenerateBody>): string[] {
  return [
    body.personImageUrl,
    body.productImageUrl,
    body.audioUrl,
    body.firstFrameImage,
    body.lastFrameImage,
    body.lipsyncingAudio,
    ...(body.products ?? []),
    ...(body.influencers ?? []),
    ...(body.images ?? []),
    ...(body.videos ?? []),
    ...(body.audios ?? []),
  ].filter((url): url is string => Boolean(url));
}

function isSafePublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "metadata.google.internal"
    ) {
      return false;
    }

    const ipv6Mapped = hostname.match(/^\[?::ffff:(\d+\.\d+\.\d+\.\d+)\]?$/)?.[1];
    if (ipv6Mapped && isPrivateIpv4(ipv6Mapped)) {
      return false;
    }

    return !isPrivateIpv4(hostname) && hostname !== "::1" && hostname !== "[::1]";
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
}
