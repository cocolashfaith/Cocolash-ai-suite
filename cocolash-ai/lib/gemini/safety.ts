/**
 * Gemini Safety & Error Handling
 *
 * Custom error class with typed error codes for the Gemini API.
 * Used across the generation pipeline for consistent error handling.
 */

// ── Error Codes ──────────────────────────────────────────────
export type GeminiErrorCode =
  | "EMPTY_RESPONSE"    // Gemini returned no candidates
  | "SAFETY_BLOCK"      // Content blocked by safety filters
  | "NO_IMAGE_DATA"     // Response had no image data in parts
  | "RATE_LIMITED"      // 429 rate limit hit
  | "TIMEOUT"           // Request timed out
  | "INVALID_API_KEY"   // Authentication failure
  | "MODEL_ERROR"       // Model-level error (e.g., overloaded)
  | "UNKNOWN";          // Catch-all

// ── Custom Error Class ───────────────────────────────────────
export class GeminiError extends Error {
  public readonly code: GeminiErrorCode;
  public readonly statusCode: number;
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    code: GeminiErrorCode,
    options?: {
      statusCode?: number;
      retryAfterMs?: number;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "GeminiError";
    this.code = code;
    this.statusCode = options?.statusCode ?? GeminiError.defaultStatusCode(code);
    this.retryAfterMs = options?.retryAfterMs;
  }

  /** Map error codes to default HTTP status codes */
  private static defaultStatusCode(code: GeminiErrorCode): number {
    switch (code) {
      case "SAFETY_BLOCK":
        return 422;
      case "RATE_LIMITED":
        return 429;
      case "INVALID_API_KEY":
        return 401;
      case "TIMEOUT":
        return 504;
      default:
        return 500;
    }
  }

  /** Human-friendly message for the UI */
  get userMessage(): string {
    switch (this.code) {
      case "SAFETY_BLOCK":
        return "The image was blocked by safety filters. Try adjusting your selections.";
      case "RATE_LIMITED":
        return "Too many requests. Please wait a moment before trying again.";
      case "EMPTY_RESPONSE":
        return "The AI returned an empty response. Please try again.";
      case "NO_IMAGE_DATA":
        return "The AI did not generate an image. Please try again with different settings.";
      case "INVALID_API_KEY":
        return "API authentication failed. Please check your API key configuration.";
      case "TIMEOUT":
        return "The request timed out. Please try again.";
      case "MODEL_ERROR":
        return "The AI model encountered an error. Please try again in a moment.";
      default:
        return "An unexpected error occurred. Please try again.";
    }
  }
}

// ── Helper: Parse Gemini API errors ──────────────────────────
/**
 * Attempts to classify a caught error into a GeminiError.
 * Handles common Gemini API error patterns.
 */
export function classifyGeminiError(error: unknown): GeminiError {
  if (error instanceof GeminiError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Rate limiting
  if (
    lowerMessage.includes("429") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("quota")
  ) {
    return new GeminiError(message, "RATE_LIMITED", {
      retryAfterMs: 30_000,
      cause: error,
    });
  }

  // Safety block
  if (
    lowerMessage.includes("safety") ||
    lowerMessage.includes("blocked") ||
    lowerMessage.includes("harm")
  ) {
    return new GeminiError(message, "SAFETY_BLOCK", { cause: error });
  }

  // Auth errors
  if (
    lowerMessage.includes("api key") ||
    lowerMessage.includes("401") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("authentication")
  ) {
    return new GeminiError(message, "INVALID_API_KEY", { cause: error });
  }

  // Timeout
  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("deadline") ||
    lowerMessage.includes("timed out")
  ) {
    return new GeminiError(message, "TIMEOUT", { cause: error });
  }

  // Model overloaded
  if (
    lowerMessage.includes("overloaded") ||
    lowerMessage.includes("503") ||
    lowerMessage.includes("unavailable")
  ) {
    return new GeminiError(message, "MODEL_ERROR", {
      retryAfterMs: 10_000,
      cause: error,
    });
  }

  return new GeminiError(message, "UNKNOWN", { cause: error });
}
