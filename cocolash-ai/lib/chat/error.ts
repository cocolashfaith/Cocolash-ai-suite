/**
 * ChatError — typed error class for the milestone v3.0 chatbot pipeline.
 *
 * Mirrors the patterns of GeminiError (lib/gemini/safety.ts), HeyGenError
 * (lib/heygen/types.ts), and SeedanceError (lib/seedance/types.ts): a
 * service-layer error class that carries a status code and a stable string
 * code so API routes can translate it to a typed JSON response without
 * stringifying internal messages.
 */

export type ChatErrorCode =
  | "missing_api_key"
  | "rate_limited"
  | "invalid_input"
  | "kb_not_found"
  | "embedding_failed"
  | "retrieval_failed"
  | "session_not_found"
  | "session_disabled"
  | "consent_required"
  | "cost_cap_exceeded"
  | "internal_error";

export class ChatError extends Error {
  public readonly status: number;
  public readonly code: ChatErrorCode;

  constructor(message: string, status: number, code: ChatErrorCode) {
    super(message);
    this.name = "ChatError";
    this.status = status;
    this.code = code;
  }
}
