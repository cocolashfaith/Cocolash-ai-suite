/**
 * Seedance 2.5 generation — the engine-2.5 branch of POST /api/seedance/generate
 * (03-PLAN.md §1.2). The legacy 2.0 handler in the route is untouched.
 *
 *   1 Seedance25GenerateBodySchema.parse        → 400 on issues
 *   2 settings = getVideoSettings(admin)        → defaults when the table is missing
 *   3 estimate = estimateCredits(…live rates…)
 *   4 optional scriptId → video_scripts lookup  → 404
 *   5 INSERT generated_videos (all 2.5 columns) → 503 migration_required, NOTHING queued
 *   6 createSeedance25Task(request, webhookUrl) → ONE POST /queue, NO retry
 *        fail ⇒ row failed + error_message ⇒ 500
 *   7 UPDATE seedance_task_id + status processing
 *   8 200 { videoId, taskId, status, engine, estimatedCost, estimate }
 *
 * No server-side script generation and no legacy prompt planner run here — the
 * wizard's Director output is authoritative (`request.prompt` /
 * `multi_frame_prompts`). Only the lash-brand guard survives, for `ugc` only.
 *
 * Order matters: the row is inserted BEFORE the queue call so a DB failure can
 * never leave a billed-but-untracked Enhancor job.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getVideoSettings } from "@/lib/settings/video-settings";
import {
  MIGRATION_REQUIRED_STATUS,
  migrationRequiredBody,
} from "@/lib/supabase/schema-errors";
import { estimateCredits } from "../pricing";
import { SeedanceError } from "../types";
import { getEnhancorWebhookUrl } from "../webhook-url";
import { createSeedance25Task } from "./client";
import { insertSeedance25Row, safeUpdateVideo, truncateErrorMessage } from "./db";
import {
  Seedance25GenerateBodySchema,
  extractInputUrls,
  formatZodIssues,
  hasVideoInputs,
  resolveQualityTier,
  type Seedance25GenerateBody,
} from "./schema";
import { AUTO_DURATION, type Seedance25Request } from "./types";

/**
 * Brand-grounding guard (ugc only, mirrors the 2.0 route): Enhancor's
 * image-to-video model has been observed drifting to face masks / serums when
 * the prompt never names the product category.
 */
const LASH_HINTS = ["lash", "lashes", "false-lash", "false lash", "strip lash", "cluster lash"];
const LASH_DIRECTIVE =
  "The product on screen is CocoLash false-lash extension strips — a small cluster lash strip in branded packaging, NOT a tube of cream, NOT a serum bottle, NOT a face mask, NOT skincare. Keep the product visually identifiable as false eyelashes throughout. ";

/**
 * Prepend the lash directive when a `ugc` prompt never mentions lashes.
 * Idempotent: a guarded prompt already contains "lash", so re-rendering a row
 * whose `request_payload` was guarded leaves the prompt byte-identical.
 */
export function applyLashGuard(request: Seedance25Request): Seedance25Request {
  if (request.mode !== "ugc" || !request.prompt) return request;
  const lower = request.prompt.toLowerCase();
  if (LASH_HINTS.some((hint) => lower.includes(hint))) return request;

  console.warn(
    "[seedance2.5/generate] ugc prompt did not mention lashes; prepending hard brand directive"
  );
  return { ...request, prompt: LASH_DIRECTIVE + request.prompt };
}

/** The prompt stored on `seedance_prompt` (multi_frame has no top-level prompt). */
export function buildSeedancePrompt(request: Seedance25Request): string {
  if (request.prompt) return request.prompt;
  if (request.multi_frame_prompts?.length) {
    return request.multi_frame_prompts
      .map((segment, index) => `Shot ${index + 1} (${segment.duration}s): ${segment.prompt}`)
      .join("\n\n");
  }
  return "";
}

/** POST /api/seedance/generate entry point once `engine === "2.5"` is detected. */
export async function handleSeedance25Generate(rawBody: unknown): Promise<NextResponse> {
  const parsed = Seedance25GenerateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodIssues(parsed.error) }, { status: 400 });
  }
  return runSeedance25Generation(parsed.data);
}

export async function runSeedance25Generation(
  body: Seedance25GenerateBody
): Promise<NextResponse> {
  const request = applyLashGuard(body.request);
  const supabase = await createAdminClient();

  // ── Step 2/3: live rates → estimate ────────────────────────
  const settings = await getVideoSettings(supabase);
  const estimate = estimateCredits({
    engine: "2.5",
    mode: request.mode,
    resolution: request.resolution,
    durationSeconds: request.duration,
    hasVideoInputs: hasVideoInputs(request),
    isUncensored: request.is_uncensored,
    multiFrameDurations: request.multi_frame_prompts?.map((segment) => segment.duration),
    rates: settings.rates,
    usdPerCredit: settings.usd_per_credit,
  });

  // ── Step 4: optional script lookup ─────────────────────────
  let scriptText = body.scriptText ?? "";
  const scriptDbId = body.scriptId ?? null;
  if (body.scriptId) {
    const { data: script, error: scriptError } = await supabase
      .from("video_scripts")
      .select("script_text")
      .eq("id", body.scriptId)
      .eq("pipeline", "seedance")
      .single();

    if (scriptError || !script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }
    scriptText = (script.script_text as string) ?? scriptText;
  }

  const seedancePrompt = buildSeedancePrompt(request);
  const qualityTier = resolveQualityTier({ qualityTier: body.qualityTier, request });
  const inputUrls = extractInputUrls(request);

  const personImageUrl =
    request.influencers?.[0] ?? request.images?.[0] ?? request.first_frame_image ?? null;
  const productImageUrl = request.products?.[0] ?? null;
  const audioUrl = request.lipsyncing_audio ?? request.audios?.[0] ?? null;

  // ── Step 5: insert BEFORE queueing (a failed insert must never bill) ──
  const inserted = await insertSeedance25Row(supabase, {
    script_id: scriptDbId,
    person_image_url: personImageUrl,
    product_image_url: productImageUrl,
    heygen_status: "pending",
    duration_seconds: request.duration === AUTO_DURATION ? null : request.duration,
    aspect_ratio: request.aspect_ratio,
    has_captions: false,
    has_watermark: false,
    has_background_music: false,
    background_type: body.campaignType ?? null,
    pipeline: "seedance",
    seedance_task_id: null,
    seedance_prompt: seedancePrompt,
    audio_mode: "script-in-prompt",
    audio_url: audioUrl,
    script_text_cache: scriptText || null,
    caption_srt: null,
    processing_cost: estimate.usdExact,
    // ── Seedance 2.5 columns ──
    engine: "2.5",
    seedance_mode: request.mode,
    quality_tier: qualityTier,
    resolution: request.resolution,
    requested_duration: request.duration,
    input_urls: inputUrls,
    request_payload: request,
    credits_cost: null,
    error_message: null,
    rerender_of: body.rerenderOf ?? null,
    output_format: request.output_format,
    bitrate_mode: request.bitrate_mode,
    is_uncensored: request.is_uncensored,
    pass_faces: request.pass_faces,
  });

  if (!inserted.ok) {
    if (inserted.migrationRequired) {
      return NextResponse.json(migrationRequiredBody(inserted.error), {
        status: MIGRATION_REQUIRED_STATUS,
      });
    }
    return NextResponse.json({ error: "Failed to create video record" }, { status: 500 });
  }

  const videoId = inserted.id;

  // ── Step 6: ONE POST to /queue, never retried ──────────────
  let taskId: string;
  try {
    const queued = await createSeedance25Task(request, getEnhancorWebhookUrl());
    taskId = queued.requestId;
  } catch (submitError) {
    const detail = describeSubmitError(submitError);
    console.error("[seedance2.5/generate] Enhancor submit error:", submitError);

    await safeUpdateVideo(supabase, videoId, {
      heygen_status: "failed",
      completed_at: new Date().toISOString(),
      error_message: truncateErrorMessage(detail),
    });

    return NextResponse.json(
      { error: `Seedance rejected the request: ${detail}` },
      { status: 500 }
    );
  }

  // ── Step 7: link the provider task ─────────────────────────
  await safeUpdateVideo(supabase, videoId, {
    seedance_task_id: taskId,
    heygen_status: "processing",
  });

  // ── Step 8 ─────────────────────────────────────────────────
  return NextResponse.json({
    videoId,
    taskId,
    status: "processing",
    engine: "2.5",
    estimatedCost: estimate.usd,
    estimate: {
      credits: estimate.credits,
      usd: estimate.usd,
      billableSeconds: estimate.billableSeconds,
      rateKind: estimate.rateKind,
      assumedAutoDuration: estimate.assumedAutoDuration,
      note: estimate.note,
    },
    ...(body.rerenderOf ? { rerenderOf: body.rerenderOf } : {}),
  });
}

/** Surface the actionable Enhancor reason (mirrors the 2.0 route's style). */
function describeSubmitError(error: unknown): string {
  if (error instanceof SeedanceError) {
    let detail = error.message;
    try {
      if (error.apiError) {
        const parsed = JSON.parse(error.apiError) as { error?: { message?: string } };
        detail = parsed?.error?.message || detail;
      }
    } catch {
      // keep error.message
    }
    return detail;
  }
  return error instanceof Error ? error.message : "Unknown error";
}
