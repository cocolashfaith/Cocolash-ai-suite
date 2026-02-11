/**
 * Gemini Image Generation
 *
 * Core function that calls the Gemini API to generate images.
 * Returns the raw image buffer and MIME type.
 */
import type { AspectRatio } from "@/lib/types";
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
 * Generates an image using Google Gemini.
 *
 * @param prompt - The full composed prompt (Brand DNA + Category + Negative)
 * @param aspectRatio - Desired aspect ratio
 * @returns GenerateImageResult with buffer, mimeType, and model info
 * @throws GeminiError with typed error code on failure
 */
export async function generateImage(
  prompt: string,
  aspectRatio: AspectRatio = "4:5"
): Promise<GenerateImageResult> {
  const client = getGeminiClient();
  const model = GEMINI_IMAGE_MODEL;

  try {
    // Call Gemini with image generation config
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ["image", "text"],
        ...(GEMINI_ASPECT_RATIOS[aspectRatio] && {
          imageConfig: {
            aspectRatio: GEMINI_ASPECT_RATIOS[aspectRatio],
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
