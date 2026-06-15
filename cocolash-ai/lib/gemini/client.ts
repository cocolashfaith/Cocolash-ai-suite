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
 * Model used for the chatbot virtual try-on, which EDITS a real customer's
 * uploaded selfie. `gemini-3-pro-image-preview` (the marketing default) applies
 * stricter responsible-AI filters to real-person photo edits and was returning
 * zero candidates. We use `gemini-3.1-flash-image` here — a fast gemini-3.x
 * image-editing model that handles selfie edits. Overridable via env (e.g. set
 * GEMINI_TRYON_IMAGE_MODEL=gemini-2.5-flash-image to fall back to nano-banana)
 * without a redeploy.
 */
export const GEMINI_TRYON_IMAGE_MODEL =
  process.env.GEMINI_TRYON_IMAGE_MODEL || "gemini-3.1-flash-image";

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
