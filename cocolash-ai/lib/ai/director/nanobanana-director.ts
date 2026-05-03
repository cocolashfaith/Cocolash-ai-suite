/**
 * NanoBanana Last-Frame Director — for first+last-frame Seedance mode.
 *
 * Pipeline:
 *   user description + first-frame URL
 *      → Claude Opus 4.7 (Last-Frame Director system prompt)
 *      → Gemini image-prompt (with environmental-consistency guardrails)
 *      → Gemini multimodal (first-frame as reference) → last-frame image
 *      → Supabase Storage upload
 *
 * The two AIs together ensure the LAST frame inherits the FIRST frame's
 * lighting, palette, framing, and identity while reflecting the user's
 * destination state. This is what makes the Seedance first+last transition
 * look smooth instead of like a hard cut.
 */

import { getOpenRouterClient, openrouterRequest } from "@/lib/openrouter/client";
import { generateImage, type ReferenceImage } from "@/lib/gemini/generate";
import { createAdminClient } from "@/lib/supabase/server";
import { uploadGeneratedImage } from "@/lib/supabase/storage";
import {
  PROMPT_REGISTRY,
  NANOBANANA_LAST_FRAME_DIRECTOR_PROMPT,
} from "./system-prompts";
import { SEEDANCE_DIRECTOR_MODEL } from "./seedance-director";
import type {
  NanoBananaDirectorInput,
  NanoBananaDirectorOutput,
} from "./types";
import type { AspectRatio } from "@/lib/types";

const NANOBANANA_TIMEOUT_MS = 30_000;
const NANOBANANA_PROMPT_ID = "nanobanana-last-frame-director";

export interface GeneratedLastFrame {
  /** Public URL of the generated last frame in Supabase Storage. */
  imageUrl: string;
  /** Storage path for cleanup / replacement. */
  storagePath: string;
  /** The image prompt the Director wrote (surfaced for review). */
  imagePrompt: string;
  diagnostics: NanoBananaDirectorOutput["diagnostics"];
}

/**
 * Step 1 of the NanoBanana chain — convert (first-frame + user description)
 * into a Gemini image-generation prompt with environmental-consistency
 * guardrails. Does NOT generate an image yet — returns just the prompt so
 * the caller can either review it or pipe it into `generateLastFrame`.
 */
export async function writeNanoBananaPrompt(
  input: NanoBananaDirectorInput
): Promise<NanoBananaDirectorOutput> {
  if (!input.firstFrameImageUrl) {
    throw new NanoBananaDirectorError(
      "INVALID_INPUT",
      "firstFrameImageUrl is required"
    );
  }
  if (!input.destinationDescription?.trim()) {
    throw new NanoBananaDirectorError(
      "INVALID_INPUT",
      "destinationDescription is required and must describe the destination scene"
    );
  }

  const start = Date.now();
  const client = getOpenRouterClient();

  // Multimodal user message — first frame as image part + user description text
  // OpenRouter forwards multimodal content to Anthropic in the right shape.
  const userContent = [
    {
      type: "image_url" as const,
      image_url: { url: input.firstFrameImageUrl },
    },
    {
      type: "text" as const,
      text:
        `Campaign type: ${input.campaignType}\n` +
        `Aspect ratio: ${input.aspectRatio}\n\n` +
        `User's destination description (what should be different in the LAST frame):\n` +
        input.destinationDescription.trim(),
    },
  ];

  const completion = await openrouterRequest(() =>
    client.chat.completions.create(
      {
        model: SEEDANCE_DIRECTOR_MODEL,
        messages: [
          { role: "system", content: NANOBANANA_LAST_FRAME_DIRECTOR_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.4,
        max_tokens: 800,
      },
      { timeout: NANOBANANA_TIMEOUT_MS }
    )
  );

  const durationMs = Date.now() - start;
  const rawResponse = completion.choices[0]?.message?.content?.trim() ?? "";

  if (!rawResponse) {
    throw new NanoBananaDirectorError(
      "EMPTY_RESPONSE",
      "Last-Frame Director returned an empty prompt. Try regenerating or refine the description."
    );
  }

  return {
    imagePrompt: stripCodeFences(rawResponse),
    diagnostics: {
      model: SEEDANCE_DIRECTOR_MODEL,
      systemPromptId: NANOBANANA_PROMPT_ID,
      inputSummary: `firstFrame=${truncate(input.firstFrameImageUrl, 60)} ` +
        `dest="${truncate(input.destinationDescription, 80)}" ` +
        `campaign=${input.campaignType} aspect=${input.aspectRatio}`,
      rawResponse,
      durationMs,
    },
  };
}

/**
 * Step 2 of the chain — generate the last-frame image using the prompt
 * produced by `writeNanoBananaPrompt` (or an edited version) and the
 * first frame as a multimodal reference.
 */
export async function generateLastFrameImage(
  imagePrompt: string,
  firstFrameImageUrl: string,
  aspectRatio: AspectRatio,
  brandId: string
): Promise<{ imageUrl: string; storagePath: string }> {
  if (!imagePrompt?.trim()) {
    throw new NanoBananaDirectorError(
      "INVALID_INPUT",
      "imagePrompt is required to generate the last frame"
    );
  }

  const firstFrameRef = await downloadAsReference(firstFrameImageUrl);

  const result = await generateImage(
    imagePrompt,
    aspectRatio,
    [firstFrameRef],
    "Use the provided first-frame image as the visual identity, environment, and lighting anchor. The generated last frame must inherit the first frame's subject, location, light, and palette while reflecting the destination state described in the prompt.",
    "1K"
  );

  const supabase = await createAdminClient();
  const { url, path } = await uploadGeneratedImage(
    supabase,
    result.buffer,
    brandId,
    "-lastframe",
    result.mimeType
  );

  return { imageUrl: url, storagePath: path };
}

/**
 * One-shot convenience — write the prompt, generate the image, return both.
 * Use this when the user has already approved the description and just
 * wants the last frame.
 */
export async function generateLastFrame(
  input: NanoBananaDirectorInput,
  brandId: string,
  outputAspectRatio: AspectRatio = "9:16"
): Promise<GeneratedLastFrame> {
  const { imagePrompt, diagnostics } = await writeNanoBananaPrompt(input);
  const { imageUrl, storagePath } = await generateLastFrameImage(
    imagePrompt,
    input.firstFrameImageUrl,
    outputAspectRatio,
    brandId
  );
  return { imageUrl, storagePath, imagePrompt, diagnostics };
}

// ── Helpers ──────────────────────────────────────────────────

async function downloadAsReference(imageUrl: string): Promise<ReferenceImage> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new NanoBananaDirectorError(
      "FETCH_ERROR",
      `Failed to download first-frame image (${response.status})`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return {
    base64Data: buffer.toString("base64"),
    mimeType: contentType,
  };
}

function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:json|markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ── Error type ───────────────────────────────────────────────

export class NanoBananaDirectorError extends Error {
  constructor(
    public code: "INVALID_INPUT" | "EMPTY_RESPONSE" | "FETCH_ERROR" | "API_ERROR",
    message: string
  ) {
    super(message);
    this.name = "NanoBananaDirectorError";
  }
}

// ── Sanity check (dev) ──────────────────────────────────────

if (
  process.env.NODE_ENV !== "production" &&
  !PROMPT_REGISTRY.find((p) => p.id === NANOBANANA_PROMPT_ID)
) {
  // Fail loudly during dev if the registry drifts from the live constant
  throw new Error(
    `NanoBanana Director prompt id '${NANOBANANA_PROMPT_ID}' is not registered in PROMPT_REGISTRY`
  );
}
