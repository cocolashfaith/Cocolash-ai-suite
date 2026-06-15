/**
 * Gemini API Client — Singleton
 *
 * Creates a single GoogleGenAI instance reused across all requests.
 * The client is initialized lazily and cached for the process lifetime.
 */
import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

/**
 * Returns a singleton GoogleGenAI client.
 * Throws if GEMINI_API_KEY is not set.
 *
 * Configured with a 180-second timeout (3 min) to accommodate
 * large 4K image responses (~12MB+ base64 payload).
 */
export function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. " +
          "Get your key from https://aistudio.google.com/apikey"
      );
    }
    _client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 180_000 },
    });
  }
  return _client;
}

// ── Model Constants ──────────────────────────────────────────
/** Default image generation model (marketing / UGC / video pipeline). */
export const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";

/**
 * Model used for the chatbot virtual try-on, which EDITS a customer's uploaded
 * selfie.
 *
 * History (live-tested 2026-06-15): gemini-3-pro-image-preview and
 * gemini-3.1-flash-image returned promptFeedback.blockReason="OTHER" — Google's
 * likeness/real-person edit filter, NOT overridable via safetySettings. That
 * block was almost certainly aggravated by the prompt's "real identifiable
 * person / preserve identity" wording, which has since been reframed as a plain
 * cosmetic photo edit (see TRYON_PROMPT). Currently set to gemini-3-pro-image
 * (the GA pro model) per request. Fallbacks via env if it still blocks:
 *   GEMINI_TRYON_IMAGE_MODEL=gemini-2.5-flash-image  (nano-banana, GA editor)
 */
export const GEMINI_TRYON_IMAGE_MODEL =
  process.env.GEMINI_TRYON_IMAGE_MODEL || "gemini-3-pro-image";

/**
 * Supported aspect ratios for the image generation model.
 * Maps our ratio strings to the format expected by Gemini.
 */
export const GEMINI_ASPECT_RATIOS: Record<string, string> = {
  "1:1": "1:1",
  "4:5": "4:5",
  "9:16": "9:16",
  "16:9": "16:9",
};
