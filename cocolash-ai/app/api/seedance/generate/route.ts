import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateVideoScript } from "@/lib/openrouter/captions";
import { createSeedanceTask } from "@/lib/seedance/client";
import {
  buildSeedanceDirectorPromptFallback,
  generateSeedanceDirectorPrompt,
  type SeedanceDirectorPromptParams,
} from "@/lib/seedance/prompt-planner";
import { getDisallowedFields, getAllowedFieldsList } from "@/lib/seedance/mode-allowlist";
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
  /**
   * Human-readable description of the product the creator should hold,
   * apply, and talk about. Falls back to a brand-grounded default so the
   * planner never drifts to skincare/cosmetics-in-general when the field
   * is omitted by the UI.
   */
  productDescription?: string;
  /**
   * v4.0 mode-first flow only. When provided, this string is used VERBATIM as
   * the Seedance prompt — the existing `generateSeedanceDirectorPrompt` planner
   * is bypassed. The brand-grounding guard still applies as a safety net.
   * Set by the v4 wizard's Step 3 after the user reviews and approves the
   * Seedance Director's output.
   */
  overridePrompt?: string;
}

/**
 * Last-resort description used when the request omits `productDescription`.
 * Without this, the prompt planner sees a raw URL string under "PRODUCT:"
 * and Claude has to guess what's in the image — which historically drifted
 * to face masks / generic skincare.
 */
const DEFAULT_PRODUCT_DESCRIPTION =
  "CocoLash DIY false-lash extension strip in its branded packaging — a premium, reusable cluster lash designed for at-home application by CocoLash.";

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

    // Mode-strict payload validation: reject disallowed fields early.
    // This catches UI bugs before they reach Enhancor.
    const generationTypeForValidation = body.generationType ?? "image-to-video";
    const seedanceModeForValidation = body.seedanceMode ?? "ugc";
    const modeForValidation = generationTypeForValidation === "text-to-video" ? "text_to_video" : seedanceModeForValidation;
    const disallowedFields = getDisallowedFields(body, modeForValidation);
    if (disallowedFields.length > 0) {
      const offendingField = disallowedFields[0];
      const allowedList = getAllowedFieldsList(modeForValidation);
      return NextResponse.json(
        {
          error: `Mode '${modeForValidation}' does not accept field '${offendingField}'. Allowed fields: ${allowedList}.`,
        },
        { status: 400 }
      );
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
      productDescription: productDescriptionFromBody,
      overridePrompt,
    } = body as SeedanceGenerateBody;

    // v4.1 callers don't supply legacy fields when overridePrompt is set.
    // Substitute sensible defaults so downstream DB inserts and Enhancor
    // calls don't crash on undefined values.
    const isV4Override = !!(overridePrompt && overridePrompt.trim().length > 0);
    const effectiveAudioMode = audioMode ?? (isV4Override ? "script-in-prompt" : audioMode);
    const effectiveScene = scene ?? (isV4Override ? "casual-bedroom" : scene);
    const effectiveVibe = vibe ?? (isV4Override ? "excited-discovery" : vibe);
    const effectivePersonDescription =
      personDescription ?? (isV4Override ? "creator from v4 wizard" : personDescription);

    const productDescription =
      typeof productDescriptionFromBody === "string" &&
      productDescriptionFromBody.trim().length > 0
        ? productDescriptionFromBody.trim()
        : DEFAULT_PRODUCT_DESCRIPTION;

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
      personDescription: effectivePersonDescription,
      productDescription,
      scene: effectiveScene,
      vibe: effectiveVibe,
      duration: parseInt(seedanceDuration, 10),
      aspectRatio,
      mode: promptMode,
      audioMode: effectiveAudioMode,
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
    if (overridePrompt && overridePrompt.trim().length > 0) {
      // v4.0 mode-first flow: user reviewed and approved the Seedance Director's
      // output in Step 3. Use it verbatim — do NOT re-run the legacy planner.
      seedancePrompt = overridePrompt.trim();
      console.log(
        `[seedance/generate] Using v4 user-approved Director prompt (${seedancePrompt.length} chars)`
      );
    } else {
      try {
        seedancePrompt = await generateSeedanceDirectorPrompt(promptPlannerParams);
      } catch (promptError) {
        console.error("[seedance/generate] Prompt planner failed, using fallback:", promptError);
        seedancePrompt = buildSeedanceDirectorPromptFallback(promptPlannerParams);
      }
    }

    // Brand-grounding guard. The planner is allowed to rewrite freely, but it
    // must never drop the lash-product anchor. If the resulting prompt doesn't
    // mention lashes by some recognizable token, prepend a hard directive so
    // Enhancor's image-to-video model can't drift into other beauty
    // categories (face mask, serum, sunscreen tube — all observed in QA).
    const lashHints = ["lash", "lashes", "false-lash", "false lash", "strip lash", "cluster lash"];
    const promptLower = seedancePrompt.toLowerCase();
    const mentionsLashes = lashHints.some((h) => promptLower.includes(h));
    if (!mentionsLashes) {
      console.warn(
        "[seedance/generate] Planner output did not mention lashes; prepending hard brand directive"
      );
      seedancePrompt =
        `The product on screen is CocoLash false-lash extension strips — a small cluster lash strip in branded packaging, NOT a tube of cream, NOT a serum bottle, NOT a face mask, NOT skincare. Keep the product visually identifiable as false eyelashes throughout. ` +
        seedancePrompt;
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
        audio_mode: effectiveAudioMode,
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
      console.log("[seedance/generate] Final prompt (full):", seedancePrompt);
      console.log("[seedance/generate] Reference URLs:", {
        personImageUrl,
        productImageUrl,
        productsArray: products,
        influencersArray: influencers,
        productDescription,
      });
      // For non-UGC modes (multi-reference, multi-frame, lipsync, first-last,
      // T2V) personImageUrl / productImageUrl may be undefined — only include
      // them in Enhancor's reference arrays when they're real strings. Falling
      // back to a single-element array containing undefined breaks the API.
      const referenceImageUrls = productImageUrl ? [productImageUrl] : [];
      const referenceAudioUrls =
        effectiveAudioMode === "uploaded-audio" && audioUrl ? [audioUrl] : undefined;
      const resolvedProducts =
        products && products.length > 0
          ? products
          : productImageUrl
          ? [productImageUrl]
          : [];
      const resolvedInfluencers =
        influencers && influencers.length > 0
          ? influencers
          : personImageUrl
          ? [personImageUrl]
          : [];
      const resolvedImages =
        images && images.length > 0
          ? images
          : [personImageUrl, productImageUrl].filter(
              (u): u is string => typeof u === "string" && u.length > 0
            );
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

  // v4.1 path: when overridePrompt is provided, the AI Director has already
  // written the final Seedance prompt — personDescription / scene / vibe /
  // audioMode aren't needed because they're encoded in the prompt itself.
  // Legacy path (overridePrompt absent) still enforces the old contract.
  const isV4Override = !!(body.overridePrompt && body.overridePrompt.trim().length > 0);
  // Text-to-video has no images at all.
  const isTextToVideo = body.generationType === "text-to-video";

  // Image-input requirements vary by mode:
  //  - text-to-video: no images at all
  //  - ugc / lipsyncing (legacy): personImageUrl + productImageUrl required
  //  - multi_reference / multi_frame: images[] carries the references
  //  - first_n_last_frames: firstFrameImage (optionally lastFrameImage)
  // We only enforce the legacy person+product pair when the request is on the
  // legacy path (no overridePrompt) AND the mode actually uses that pair.
  const usesPersonProductPair =
    !body.seedanceMode ||
    body.seedanceMode === "ugc" ||
    body.seedanceMode === "lipsyncing";
  const hasAlternativeImages =
    (Array.isArray(body.images) && body.images.length > 0) ||
    Boolean(body.firstFrameImage);

  if (!isTextToVideo && usesPersonProductPair && !hasAlternativeImages) {
    if (!body.personImageUrl) errors.push("personImageUrl is required");
    if (!body.productImageUrl) errors.push("productImageUrl is required");
  }

  if (!isV4Override) {
    if (!body.personDescription) errors.push("personDescription is required");
    if (body.personDescription && body.personDescription.length > 800) {
      errors.push("personDescription must be 800 characters or less");
    }
    if (!body.scene) errors.push("scene is required");
    if (!body.vibe) errors.push("vibe is required");
  }

  if (body.scriptText && body.scriptText.length > 2500) {
    errors.push("scriptText must be 2500 characters or less");
  }

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
  // Enhancor /queue accepts {16:9, 4:3, 3:4, 9:16} at every resolution.
  // Curl-verified 2026-05-04 — see .planning/phases/14-audit/evidence/
  // BROKEN-05-1080p-matrix-with-key.txt. The old "1080p × 16:9 only" rule
  // was a UI artifact, not an API constraint.
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
  // audioMode is a legacy field — only enforce when caller is on the old
  // contract. v4.1 wizards don't ship an audioMode (the AI prompt covers it).
  if (!isV4Override) {
    if (
      !body.audioMode ||
      !VALID_AUDIO_MODES.includes(body.audioMode as (typeof VALID_AUDIO_MODES)[number])
    ) {
      errors.push(`audioMode must be one of: ${VALID_AUDIO_MODES.join(", ")}`);
    }
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
