import { describe, it, expect } from "vitest";
import {
  composeSystemPrompt,
  AR_TRYON_URL,
  DEFAULT_VOICE_FRAGMENTS,
} from "./voice";

/**
 * Coco should be able to recommend CocoLash's live AR try-on experience, so the
 * URL + guidance must be present in the composed system prompt.
 */
describe("AR try-on recommendation in the system prompt", () => {
  it("surfaces the live AR try-on URL and guidance", () => {
    const prompt = composeSystemPrompt({
      fragments: DEFAULT_VOICE_FRAGMENTS,
      isBusinessHours: true,
    });
    expect(prompt).toContain(AR_TRYON_URL);
    expect(prompt.toLowerCase()).toContain("ar try-on");
  });
});
