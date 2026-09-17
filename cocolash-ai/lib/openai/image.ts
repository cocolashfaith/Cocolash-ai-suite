/**
 * OpenAI GPT Image — composed-avatar generation (2026-09-17, Harry's call).
 *
 * Replaces Gemini for the UGC avatar path when `OPENAI_API_KEY` is set; the
 * route falls back to Gemini when it is not (so environments without the key
 * keep working). Default model: `gpt-image-2.5-sunburst` — picked over
 * `-flare` in a same-inputs head-to-head on the CocoLash kit (sunburst kept
 * the rigid matte gift-box construction; flare drifted to a kraft mailer).
 *
 * With reference images we call `POST /v1/images/edits` (JSON body,
 * `images: [{image_url}]`, up to 16 per the API — we cap lower); without,
 * `POST /v1/images/generations`. GPT image models always return b64_json.
 * The 2.5 models reject `input_fidelity` (fidelity is built in) — do not
 * send it.
 */

import type { VideoAspectRatio } from "@/lib/types";

const OPENAI_BASE = "https://api.openai.com/v1";

export const OPENAI_IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";

/** 2.5-only tier; the strongest below "max" (kept off for cost). */
export const OPENAI_IMAGE_QUALITY = "xhigh";

/** True when the OpenAI image path is usable in this environment. */
export function openAIImageConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Arbitrary sizes are allowed (divisible by 16, ratio within 1:3–3:1), so we
 * render TRUE aspect ratios instead of the nearest preset.
 */
export function openAISizeForAspect(aspect: VideoAspectRatio): string {
  switch (aspect) {
    case "9:16":
      return "1152x2048";
    case "16:9":
      return "2048x1152";
    case "1:1":
    default:
      return "1024x1024";
  }
}

export interface OpenAIImageResult {
  buffer: Buffer;
  mimeType: string;
  model: string;
}

/**
 * Build the JSON payload — exported for tests. `referenceImageUrls` order
 * matters: the prompt tells the model the FIRST is the product being held.
 */
export function buildOpenAIImagePayload(args: {
  prompt: string;
  aspect: VideoAspectRatio;
  referenceImageUrls?: readonly string[];
}): { endpoint: string; body: Record<string, unknown> } {
  const refs = (args.referenceImageUrls ?? []).filter(Boolean);
  const base = {
    model: OPENAI_IMAGE_MODEL,
    prompt: args.prompt,
    size: openAISizeForAspect(args.aspect),
    quality: OPENAI_IMAGE_QUALITY,
  };
  if (refs.length === 0) {
    return { endpoint: `${OPENAI_BASE}/images/generations`, body: base };
  }
  return {
    endpoint: `${OPENAI_BASE}/images/edits`,
    body: { ...base, images: refs.map((image_url) => ({ image_url })) },
  };
}

/**
 * Generate one image. Throws with the API's own message on failure — the
 * route surfaces it, and its Gemini fallback only covers a MISSING key, not
 * a failed call (a silent engine swap would hide real problems).
 */
export async function generateOpenAIImage(args: {
  prompt: string;
  aspect: VideoAspectRatio;
  referenceImageUrls?: readonly string[];
}): Promise<OpenAIImageResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");

  const { endpoint, body } = buildOpenAIImagePayload(args);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    data?: { b64_json?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `OpenAI image API ${res.status}: ${data.error?.message ?? "unknown error"}`
    );
  }
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI image API returned no image data");
  }
  return {
    buffer: Buffer.from(b64, "base64"),
    mimeType: "image/png",
    model: OPENAI_IMAGE_MODEL,
  };
}
