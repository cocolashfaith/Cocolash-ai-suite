/**
 * Seedance Director — server-side prompt-writer service.
 *
 * Routes Director input through the right mode-specific system prompt and
 * returns a Seedance-optimized prompt (or array of segment prompts for
 * multi_frame mode).
 *
 * Model: Claude Opus 4.7 via OpenRouter (Faith requires Opus 4 minimum).
 * If the OpenRouter call fails or times out, the error is surfaced to the
 * UI — there is NO silent fallback (per AI-08 in REQUIREMENTS.md).
 */

import { getOpenRouterClient, openrouterRequest } from "@/lib/openrouter/client";
import { getSeedanceDirectorPrompt } from "./system-prompts";
import type {
  DirectorInput,
  DirectorMode,
  DirectorPromptOutput,
  ImageRoleRef,
} from "./types";
import type { SeedanceMultiFramePrompt } from "@/lib/seedance/types";

/** Centralized model constant — Faith's hard requirement is Opus 4 minimum. */
export const SEEDANCE_DIRECTOR_MODEL = "anthropic/claude-opus-4.7";

/** Hard timeout per call (ms). Surface failures fast so the UI can react. */
const DIRECTOR_TIMEOUT_MS = 30_000;

/**
 * Run the Seedance Director on `input` and return the generated prompt
 * (plus diagnostics). For multi_frame mode, the response is a JSON array
 * of `{prompt, duration}` segments instead of a single prompt string.
 */
export async function runSeedanceDirector(
  input: DirectorInput
): Promise<DirectorPromptOutput> {
  validateDirectorInput(input);

  const { id: systemPromptId, text: systemPrompt } = getSeedanceDirectorPrompt(
    input.mode
  );
  const userMessage = composeUserMessage(input);
  const inputSummary = summarizeInput(input);

  const start = Date.now();
  const client = getOpenRouterClient();
  const completion = await openrouterRequest(() =>
    client.chat.completions.create(
      {
        model: SEEDANCE_DIRECTOR_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        // Opus 4 should answer with one prompt — no need for high creativity.
        temperature: 0.4,
        // Cap prompts at ~600 tokens. Multi-frame JSON segments fit comfortably.
        max_tokens: 1200,
      },
      { timeout: DIRECTOR_TIMEOUT_MS }
    )
  );

  const durationMs = Date.now() - start;
  const rawResponse = completion.choices[0]?.message?.content?.trim() ?? "";

  if (!rawResponse) {
    throw new SeedanceDirectorError(
      "EMPTY_RESPONSE",
      "Director returned an empty prompt. Try again or edit the prompt manually before generating."
    );
  }

  if (input.mode === "multi_frame") {
    const segments = parseMultiFrameSegments(rawResponse);
    return {
      prompt: "",
      multiFramePrompts: segments,
      diagnostics: {
        model: SEEDANCE_DIRECTOR_MODEL,
        systemPromptId,
        inputSummary,
        rawResponse,
        durationMs,
      },
    };
  }

  return {
    prompt: stripCodeFences(rawResponse),
    diagnostics: {
      model: SEEDANCE_DIRECTOR_MODEL,
      systemPromptId,
      inputSummary,
      rawResponse,
      durationMs,
    },
  };
}

// ── Input validation ─────────────────────────────────────────

function validateDirectorInput(input: DirectorInput): void {
  if (!input.mode) throw new SeedanceDirectorError("INVALID_INPUT", "mode is required");
  if (!input.campaignType)
    throw new SeedanceDirectorError("INVALID_INPUT", "campaignType is required");
  if (!input.tone) throw new SeedanceDirectorError("INVALID_INPUT", "tone is required");
  if (!input.aspectRatio)
    throw new SeedanceDirectorError("INVALID_INPUT", "aspectRatio is required");
  if (!input.durationSeconds || input.durationSeconds < 5)
    throw new SeedanceDirectorError(
      "INVALID_INPUT",
      "durationSeconds must be ≥ 5"
    );

  const requiresScript: DirectorMode[] = [
    "ugc",
    "multi_reference",
    "multi_frame",
    "first_n_last_frames",
    // lipsyncing intentionally not in this list — uses uploaded audio instead
  ];
  if (requiresScript.includes(input.mode) && !input.script?.trim()) {
    throw new SeedanceDirectorError(
      "INVALID_INPUT",
      `mode '${input.mode}' requires a non-empty script`
    );
  }

  if (input.mode === "text_to_video" && !input.sceneDescription?.trim()) {
    throw new SeedanceDirectorError(
      "INVALID_INPUT",
      "text_to_video mode requires a non-empty sceneDescription"
    );
  }

  if (input.mode === "ugc" && !input.composedPersonProductImage?.url) {
    throw new SeedanceDirectorError(
      "INVALID_INPUT",
      "ugc mode requires composedPersonProductImage (single composed image)"
    );
  }

  if (input.mode === "multi_reference" && !input.referenceImages?.length) {
    throw new SeedanceDirectorError(
      "INVALID_INPUT",
      "multi_reference mode requires at least one reference image"
    );
  }

  if (input.mode === "lipsyncing") {
    if (!input.composedPersonProductImage?.url)
      throw new SeedanceDirectorError(
        "INVALID_INPUT",
        "lipsyncing mode requires an image (composedPersonProductImage)"
      );
    if (!input.referenceAudioUrl)
      throw new SeedanceDirectorError(
        "INVALID_INPUT",
        "lipsyncing mode requires referenceAudioUrl"
      );
  }

  if (input.mode === "first_n_last_frames") {
    if (!input.firstFrameImage?.url)
      throw new SeedanceDirectorError(
        "INVALID_INPUT",
        "first_n_last_frames mode requires firstFrameImage"
      );
    if (!input.lastFrameImage?.url)
      throw new SeedanceDirectorError(
        "INVALID_INPUT",
        "first_n_last_frames mode requires lastFrameImage (generate via NanoBanana first)"
      );
  }

  if (input.mode === "multi_frame") {
    const count = input.multiFrameSegmentCount ?? 3;
    if (count < 1 || count > 5) {
      throw new SeedanceDirectorError(
        "INVALID_INPUT",
        "multi_frame multiFrameSegmentCount must be between 1 and 5"
      );
    }
    if (!input.subjectBrief?.trim() || input.subjectBrief.trim().length < 10) {
      throw new SeedanceDirectorError(
        "INVALID_INPUT",
        "multi_frame mode requires subjectBrief with at least 10 characters"
      );
    }
  }
}

// ── User-message composition (per mode) ──────────────────────

function composeUserMessage(input: DirectorInput): string {
  const lines: string[] = [];
  lines.push(`Campaign type: ${input.campaignType}`);
  lines.push(`Tone: ${input.tone}`);
  lines.push(`Total duration: ${input.durationSeconds}s`);
  lines.push(`Aspect ratio: ${input.aspectRatio}`);
  if (input.script) lines.push("", "Script (verbatim):", input.script);
  if (input.sceneDescription)
    lines.push("", "User scene description:", input.sceneDescription);

  switch (input.mode) {
    case "ugc":
      lines.push(
        "",
        "Single composed image (avatar already holding the product) is provided to Seedance separately:",
        `  ${input.composedPersonProductImage!.url}`
      );
      break;
    case "multi_reference":
      lines.push("", "Reference assets:");
      for (const [i, ref] of input.referenceImages!.entries()) {
        const role = ref.role ?? "appearance";
        const note = ref.note ? ` — ${ref.note}` : "";
        lines.push(`  @image${i + 1} (${role})${note}`);
      }
      if (input.referenceVideoUrl)
        lines.push(`  @video1 (motion / camera reference)`);
      if (input.referenceAudioUrl)
        lines.push(`  @audio1 (rhythm / voice reference)`);
      break;
    case "multi_frame": {
      const count = input.multiFrameSegmentCount ?? 3;
      const totalSeconds = input.durationSeconds;
      lines.push(
        "",
        `Plan exactly ${count} segments. Total duration ${totalSeconds}s. ` +
          `Distribute durations sensibly (each segment 3-8s, all integers, summing to ${totalSeconds}).`
      );
      if (input.subjectBrief?.trim()) {
        lines.push(
          "",
          "Subject brief (textual anchor for all segments):",
          input.subjectBrief.trim()
        );
      }
      break;
    }
    case "lipsyncing":
      lines.push(
        "",
        `Speaker image: ${input.composedPersonProductImage!.url}`,
        `Audio reference: ${input.referenceAudioUrl}`
      );
      if (input.referenceVideoUrl)
        lines.push(`Optional video reference: ${input.referenceVideoUrl}`);
      break;
    case "first_n_last_frames":
      lines.push(
        "",
        `First frame: ${input.firstFrameImage!.url}`,
        `Last frame (generated by NanoBanana from user description): ${input.lastFrameImage!.url}`
      );
      break;
    case "text_to_video":
      // sceneDescription already added above
      break;
  }

  // Phase 27 injection: product truth block
  if (input.productTruth) {
    const t = input.productTruth;
    lines.push("");
    lines.push("PRODUCT TRUTH (use as anchor — do not contradict):");
    lines.push(`- Display name: ${t.displayName}`);
    lines.push(`- Lash type: ${t.lashType}${t.lengthRange ? ` (${t.lengthRange})` : ""}`);
    lines.push(`- Band material: ${t.bandMaterial}`);
    lines.push(
      `- Magnetic closure: ${t.magneticClosure ? "YES" : "NO — never claim magnetic"}`
    );
    lines.push(`- Packaging: ${t.packagingType}`);
    if (t.kitContents && t.kitContents.length > 0) {
      lines.push(`- Kit contents: ${t.kitContents.join(", ")}`);
    }
    lines.push(`- Tone/colour: ${t.colorTone ?? "—"}`);
  }

  // Phase 27 injection: reference images block
  if (input.productReferenceImageUrls?.length) {
    lines.push("");
    lines.push("REFERENCE IMAGES AVAILABLE (use these as visual anchors when describing the product):");
    for (const [i, url] of input.productReferenceImageUrls.entries()) {
      lines.push(`- @ref${i + 1}: ${url}`);
    }
  }

  // Phase 27 injection: brand DNA block
  if (input.brandDna) {
    lines.push("");
    lines.push("BRAND DNA (must respect):");
    lines.push(input.brandDna);
  }

  if (input.userInstructions?.trim()) {
    lines.push("", "User instructions (honor these — they override defaults):");
    lines.push(input.userInstructions.trim());
  }

  return lines.join("\n");
}

// ── Multi-frame parser ──────────────────────────────────────

function parseMultiFrameSegments(raw: string): SeedanceMultiFramePrompt[] {
  const cleaned = stripCodeFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new SeedanceDirectorError(
      "PARSE_ERROR",
      `Multi-frame Director did not return valid JSON. Raw: ${cleaned.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new SeedanceDirectorError(
      "PARSE_ERROR",
      "Multi-frame Director must return a non-empty array of segments"
    );
  }

  const segments: SeedanceMultiFramePrompt[] = parsed.map(
    (entry: unknown, i: number) => {
      if (!entry || typeof entry !== "object") {
        throw new SeedanceDirectorError(
          "PARSE_ERROR",
          `Segment ${i + 1} is not an object`
        );
      }
      const obj = entry as Record<string, unknown>;
      const prompt =
        typeof obj.prompt === "string" ? obj.prompt.trim() : "";
      const duration =
        typeof obj.duration === "number"
          ? Math.round(obj.duration)
          : Number.parseInt(String(obj.duration), 10);
      if (!prompt) {
        throw new SeedanceDirectorError(
          "PARSE_ERROR",
          `Segment ${i + 1} missing 'prompt' field`
        );
      }
      if (!Number.isFinite(duration) || duration < 1) {
        throw new SeedanceDirectorError(
          "PARSE_ERROR",
          `Segment ${i + 1} missing valid integer 'duration' field`
        );
      }
      return { prompt, duration };
    }
  );

  const total = segments.reduce((sum, s) => sum + s.duration, 0);
  if (total < 4 || total > 15) {
    throw new SeedanceDirectorError(
      "INVALID_OUTPUT",
      `Multi-frame total duration must be 4-15s; got ${total}s. Director must retry or user must edit.`
    );
  }

  return segments;
}

function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:json|markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function summarizeInput(input: DirectorInput): string {
  const refCount = input.referenceImages?.length ?? 0;
  const hasVideo = !!input.referenceVideoUrl;
  const hasAudio = !!input.referenceAudioUrl;
  const summary: string[] = [
    `mode=${input.mode}`,
    `campaign=${input.campaignType}`,
    `tone=${input.tone}`,
    `duration=${input.durationSeconds}s`,
    `aspect=${input.aspectRatio}`,
  ];
  if (refCount > 0) summary.push(`refImages=${refCount}`);
  if (hasVideo) summary.push("refVideo=yes");
  if (hasAudio) summary.push("refAudio=yes");
  if (input.composedPersonProductImage) summary.push("composed=yes");
  if (input.firstFrameImage) summary.push("firstFrame=yes");
  if (input.lastFrameImage) summary.push("lastFrame=yes");
  if (input.productTruth) summary.push(`product=${input.productTruth.sku}`);
  if (input.productReferenceImageUrls?.length)
    summary.push(`productRefs=${input.productReferenceImageUrls.length}`);
  return summary.join(" ");
}

// ── Error type ───────────────────────────────────────────────

export class SeedanceDirectorError extends Error {
  constructor(
    public code:
      | "INVALID_INPUT"
      | "EMPTY_RESPONSE"
      | "PARSE_ERROR"
      | "INVALID_OUTPUT"
      | "TIMEOUT"
      | "API_ERROR",
    message: string
  ) {
    super(message);
    this.name = "SeedanceDirectorError";
  }
}
