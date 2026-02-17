/**
 * Gemini Image Generation
 *
 * Core function that calls the Gemini API to generate images.
 * Returns the raw image buffer and MIME type.
 */
import type { AspectRatio, ImageResolution } from "@/lib/types";
import { getGeminiClient, GEMINI_IMAGE_MODEL, GEMINI_ASPECT_RATIOS } from "./client";
import { GeminiError, classifyGeminiError } from "./safety";

// ── Result Type ──────────────────────────────────────────────
export interface GenerateImageResult {
  /** Raw image data as Buffer */
  buffer: Buffer;
  /** MIME type of the generated image (e.g., "image/png") */
  mimeType: string;
  /** The model used for generation */
  model: string;
}

// ── Main Generate Function ───────────────────────────────────
/**
 * A reference image to include in the Gemini API call.
 * Used for product photography to show the AI the actual product.
 */
export interface ReferenceImage {
  /** Base64-encoded image data */
  base64Data: string;
  /** MIME type (e.g., "image/png", "image/jpeg") */
  mimeType: string;
}

/**
 * Generates an image using Google Gemini.
 *
 * @param prompt - The full composed prompt (Brand DNA + Category + Negative)
 * @param aspectRatio - Desired aspect ratio
 * @param referenceImages - Optional array of reference images for multimodal generation
 * @param referenceInstruction - Optional custom instruction for reference images
 *        (defaults to product reference wording; pass a custom string for Before/After etc.)
 * @param resolution - Output image resolution: "1K", "2K", or "4K" (defaults to "1K")
 * @returns GenerateImageResult with buffer, mimeType, and model info
 * @throws GeminiError with typed error code on failure
 */
export async function generateImage(
  prompt: string,
  aspectRatio: AspectRatio = "4:5",
  referenceImages?: ReferenceImage[],
  referenceInstruction?: string,
  resolution: ImageResolution = "1K"
): Promise<GenerateImageResult> {
  const client = getGeminiClient();
  const model = GEMINI_IMAGE_MODEL;

  // Retry config: higher resolutions are more prone to transient fetch failures
  const maxRetries = resolution === "4K" ? 3 : resolution === "2K" ? 2 : 1;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await _callGemini(client, model, prompt, aspectRatio, referenceImages, referenceInstruction, resolution);
    } catch (error) {
      const isTransientFetch =
        error instanceof Error &&
        !(error instanceof GeminiError) &&
        /fetch failed|ECONNRESET|socket hang up|ETIMEDOUT/i.test(error.message);

      if (isTransientFetch && attempt < maxRetries) {
        const delay = attempt * 2000;
        console.warn(`[Gemini] Transient fetch error on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }

  // TypeScript: should never reach here, but satisfies return type
  throw new GeminiError("All retry attempts exhausted.", "UNKNOWN");
}

/**
 * Internal function that performs the actual Gemini API call.
 * Separated to support the retry wrapper in generateImage().
 */
async function _callGemini(
  client: ReturnType<typeof getGeminiClient>,
  model: string,
  prompt: string,
  aspectRatio: AspectRatio,
  referenceImages?: ReferenceImage[],
  referenceInstruction?: string,
  resolution: ImageResolution = "1K"
): Promise<GenerateImageResult> {
  try {
    // Build contents: text-only or multimodal (text + reference images)
    let contents: string | { role: string; parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[];

    if (referenceImages && referenceImages.length > 0) {
      // Multimodal: reference images + text prompt
      const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];

      // Add reference image instruction first (custom or default product wording)
      const instruction = referenceInstruction
        ?? `[PRODUCT REFERENCE IMAGES — ${referenceImages.length} image(s) provided below]\nStudy these reference images carefully. They show the EXACT product you must recreate.`;
      parts.push({ text: instruction });

      // Add each reference image
      for (const ref of referenceImages) {
        parts.push({
          inlineData: {
            mimeType: ref.mimeType,
            data: ref.base64Data,
          },
        });
      }

      // Add the main prompt after the images
      parts.push({ text: prompt });

      contents = [{ role: "user", parts }];
    } else {
      contents = prompt;
    }

    // Call Gemini with image generation config
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        responseModalities: ["image", "text"],
        ...(GEMINI_ASPECT_RATIOS[aspectRatio] && {
          imageConfig: {
            aspectRatio: GEMINI_ASPECT_RATIOS[aspectRatio],
            imageSize: resolution,
          },
        }),
      },
    });

    // Validate response structure
    if (!response.candidates || response.candidates.length === 0) {
      throw new GeminiError(
        "Gemini returned no candidates in the response.",
        "EMPTY_RESPONSE"
      );
    }

    const candidate = response.candidates[0];

    // Check for safety block
    if (candidate.finishReason === "SAFETY") {
      throw new GeminiError(
        "Image generation was blocked by safety filters.",
        "SAFETY_BLOCK"
      );
    }

    // Extract image data from parts
    const parts = candidate.content?.parts;
    if (!parts || parts.length === 0) {
      throw new GeminiError(
        "Response contained no content parts.",
        "EMPTY_RESPONSE"
      );
    }

    // Find the image part
    for (const part of parts) {
      if (part.inlineData?.data) {
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || "image/png";
        const buffer = Buffer.from(base64Data, "base64");

        if (buffer.length === 0) {
          throw new GeminiError(
            "Image data decoded to empty buffer.",
            "NO_IMAGE_DATA"
          );
        }

        return { buffer, mimeType, model };
      }
    }

    // If we got here, no image data was found
    // Check if there was text (could indicate an error message from the model)
    const textParts = parts.filter((p) => p.text).map((p) => p.text);
    const textContent = textParts.join(" ").trim();

    throw new GeminiError(
      textContent
        ? `Gemini returned text instead of an image: "${textContent.substring(0, 200)}"`
        : "No image data found in the response.",
      "NO_IMAGE_DATA"
    );
  } catch (error) {
    // Re-throw GeminiErrors as-is
    if (error instanceof GeminiError) throw error;

    // Classify and re-throw unknown errors
    throw classifyGeminiError(error);
  }
}
