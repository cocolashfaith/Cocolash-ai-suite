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
 *   8 200 { videoId, taskId, status, engine, estimatedCost, corrections, estimate }
 *
 * No server-side script generation and no legacy prompt planner run here — the
 * wizard's Director output is authoritative (`request.prompt` /
 * `multi_frame_prompts`). Two things still touch the approved prompt, and both
 * are visible to the user: the category guard (`ugc` only, and only when the
 * prompt names no product at all) and the product-truth validator, whose
 * `corrections` are returned in the response and stored in `request_payload`.
 *
 * Order matters: the row is inserted BEFORE the queue call so a DB failure can
 * never leave a billed-but-untracked Enhancor job.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getVideoSettings } from "@/lib/settings/video-settings";
import { getProductTruthBySku } from "@/lib/brand/product-truth";
import {
  validateAndCorrectPrompt,
  type PromptCorrection,
} from "@/lib/brand/prompt-validator";
import {
  MIGRATION_REQUIRED_STATUS,
  migrationRequiredBody,
} from "@/lib/supabase/schema-errors";
import {
  mentionsProductCategory,
  PRODUCT_CATEGORY_DIRECTIVE,
} from "../prompt-planner";
import { estimateCredits } from "../pricing";
import { SeedanceError } from "../types";
import { getEnhancorWebhookUrl, redactWebhookSecret } from "../webhook-url";
import { createSeedance25Task } from "./client";
import { insertSeedance25Row, safeUpdateVideo, truncateErrorMessage } from "./db";
import {
  Seedance25GenerateBodySchema,
  extractInputUrls,
  formatZodIssues,
  hasVideoInputs,
  resolveQualityTier,
  stripInternalGenerateFields,
  type Seedance25GenerateBody,
} from "./schema";
import { AUTO_DURATION, type Seedance25Request } from "./types";

/**
 * Category guard (ugc only, mirrors the 2.0 route): Enhancor's image-to-video
 * model has been observed drifting to face masks / serums when the prompt never
 * names the product category.
 *
 * The guard names the CATEGORY only — never a lash format or packaging. See
 * `PRODUCT_CATEGORY_DIRECTIVE` in ../prompt-planner for why the old
 * "extension strips … cluster lash strip" wording had to go.
 *
 * Idempotent: a guarded prompt contains "lash", so re-rendering a row whose
 * `request_payload` was guarded leaves the prompt byte-identical.
 *
 * F8 (06-QUALITY-PASS.md): the anchor is APPENDED as a tail clause, never
 * prepended. The Director is required to open its prompt with the creator, and
 * the video model weights the opening most heavily — a category sentence bolted
 * on in front of that demoted identity to second place in every guarded prompt.
 */
export function applyProductGuard(request: Seedance25Request): Seedance25Request {
  if (request.mode !== "ugc" || !request.prompt) return request;
  if (mentionsProductCategory(request.prompt)) return request;

  const body = request.prompt.trimEnd();
  const separator = /[.!?…]["')\]]?$/.test(body) ? "" : ".";
  const prompt = `${body}${separator} ${PRODUCT_CATEGORY_DIRECTIVE.trim()}`;

  console.warn(
    "[seedance2.5/generate] ugc prompt did not name the product; appending the category anchor as a tail clause"
  );
  return { ...request, prompt };
}

/**
 * Last line of defence before the wire: rewrite any claim the prompt makes that
 * the product truth contradicts (05-GROUNDING-FIX.md §4 D / decisions G4+G5).
 *
 * Every prompt that leaves this function is what gets POSTed to `/queue`, what
 * is stored on `seedance_prompt`, and what is replayed on a re-render. The
 * `corrections` it returns are persisted and shown to the user — a silent
 * rewrite is exactly the bug this package exists to remove.
 */
export function applyPromptValidation(
  request: Seedance25Request,
  sku: string | null
): { request: Seedance25Request; corrections: PromptCorrection[] } {
  const truth = sku ? getProductTruthBySku(sku) ?? null : null;
  const corrections: PromptCorrection[] = [];
  let next = request;

  if (request.prompt) {
    const validated = validateAndCorrectPrompt({ prompt: request.prompt, truth, sku });
    corrections.push(...validated.corrections);
    if (validated.prompt !== request.prompt) {
      next = { ...next, prompt: validated.prompt };
    }
  }

  const segments = request.multi_frame_prompts;
  if (segments?.length) {
    let changed = false;
    const validatedSegments = segments.map((segment) => {
      const validated = validateAndCorrectPrompt({ prompt: segment.prompt, truth, sku });
      corrections.push(...validated.corrections);
      if (validated.prompt === segment.prompt) return segment;
      changed = true;
      return { ...segment, prompt: validated.prompt };
    });
    if (changed) next = { ...next, multi_frame_prompts: validatedSegments };
  }

  return { request: next, corrections: dedupeCorrections(corrections) };
}

/** Same claim corrected in several shots is one correction for the user. */
function dedupeCorrections(corrections: PromptCorrection[]): PromptCorrection[] {
  const seen = new Set<string>();
  return corrections.filter((correction) => {
    const key = `${correction.claim}→${correction.replacement ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

/**
 * POST /api/seedance/generate entry point once `engine === "2.5"` is detected.
 * PUBLIC: `rerenderOf` is stripped here — only the rerender route may set it,
 * and it reaches `runSeedance25Generation` without passing through this door.
 */
export async function handleSeedance25Generate(rawBody: unknown): Promise<NextResponse> {
  const parsed = Seedance25GenerateBodySchema.safeParse(
    stripInternalGenerateFields(rawBody)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodIssues(parsed.error) }, { status: 400 });
  }
  return runSeedance25Generation(parsed.data);
}

export async function runSeedance25Generation(
  body: Seedance25GenerateBody
): Promise<NextResponse> {
  // Guard first (it may add the only product mention), then validate — so the
  // validator sees the exact text that is about to go on the wire.
  const { request, corrections } = applyPromptValidation(
    applyProductGuard(body.request),
    body.productSku ?? null
  );
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
    // `corrections` rides inside the existing JSONB rather than a new column
    // (a new column would need a migration). The re-render route spreads this
    // payload into the zod request schema, which drops unknown keys, so the
    // extra key can never reach Enhancor. Omitted entirely when nothing was
    // corrected, keeping untouched payloads byte-identical.
    request_payload: corrections.length > 0 ? { ...request, corrections } : request,
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
    // Log the SCRUBBED detail, never the raw error object — its message and
    // `apiError` can echo back `webhook_url?token=<ENHANCOR_WEBHOOK_SECRET>`.
    console.error("[seedance2.5/generate] Enhancor submit error:", detail);

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
    // Always present (empty when nothing was rewritten) so Step 3 can render
    // "we changed this and why" without probing for the field.
    corrections,
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

/**
 * Surface the actionable Enhancor reason (mirrors the 2.0 route's style).
 *
 * The result is logged, written to `error_message` and returned to the browser,
 * so ENHANCOR_WEBHOOK_SECRET is scrubbed here as well as in the client — the
 * error may have been assembled from a body the client never parsed.
 */
export function describeSubmitError(error: unknown): string {
  const detail = (() => {
    if (error instanceof SeedanceError) {
      let message = error.message;
      try {
        if (error.apiError) {
          const parsed = JSON.parse(error.apiError) as { error?: { message?: string } };
          message = parsed?.error?.message || message;
        }
      } catch {
        // keep error.message
      }
      return message;
    }
    return error instanceof Error ? error.message : "Unknown error";
  })();
  return redactWebhookSecret(detail);
}
