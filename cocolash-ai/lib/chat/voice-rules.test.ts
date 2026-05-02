/**
 * Smoke test for lib/chat/voice-rules.ts.
 *
 * Asserts that every required forbidden-pattern phrase is literally present
 * in VOICE_RULES so a careless edit can't silently drop a rule.
 *
 * Also asserts that the composed system prompt:
 *   1. Contains the persona name
 *   2. Contains the locked rules block
 *   3. Places the rules block AFTER editable fragments (so a fragment edit
 *      cannot shadow a rule).
 */

import { describe, it, expect } from "vitest";
import {
  VOICE_RULES,
  VOICE_RULES_VERSION,
  REQUIRED_RULE_PHRASES,
} from "./voice-rules";
import { composeSystemPrompt, DEFAULT_VOICE_FRAGMENTS } from "./voice";

describe("voice-rules", () => {
  it("VOICE_RULES contains every required phrase", () => {
    for (const phrase of REQUIRED_RULE_PHRASES) {
      expect(
        VOICE_RULES,
        `missing required phrase: "${phrase}"`
      ).toContain(phrase);
    }
  });

  it("VOICE_RULES_VERSION is set", () => {
    expect(VOICE_RULES_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("VOICE_RULES is not empty", () => {
    expect(VOICE_RULES.length).toBeGreaterThan(500);
  });
});

describe("composeSystemPrompt", () => {
  const baseInput = {
    fragments: DEFAULT_VOICE_FRAGMENTS,
    isBusinessHours: true,
  } as const;

  it("includes persona name", () => {
    const prompt = composeSystemPrompt(baseInput);
    expect(prompt).toContain("Coco");
  });

  it("includes the locked rules block", () => {
    const prompt = composeSystemPrompt(baseInput);
    expect(prompt).toContain(VOICE_RULES);
  });

  it("places locked rules AFTER editable fragments (fragments cannot shadow rules)", () => {
    const prompt = composeSystemPrompt(baseInput);
    const fragmentsIdx = prompt.indexOf("## Editable voice fragments");
    const rulesIdx = prompt.indexOf("## Locked brand-voice rules");
    expect(fragmentsIdx).toBeGreaterThan(-1);
    expect(rulesIdx).toBeGreaterThan(fragmentsIdx);
  });

  it("appends after_hours_suffix when isBusinessHours is false", () => {
    const prompt = composeSystemPrompt({
      ...baseInput,
      isBusinessHours: false,
    });
    expect(prompt).toContain(DEFAULT_VOICE_FRAGMENTS.after_hours_suffix);
  });

  it("does NOT append after_hours_suffix when isBusinessHours is true", () => {
    const prompt = composeSystemPrompt({
      ...baseInput,
      isBusinessHours: true,
    });
    // The suffix string should not be glued onto the escalation line; we
    // assert it's absent from the editable-fragments rendering specifically.
    const fragmentsIdx = prompt.indexOf("## Editable voice fragments");
    const rulesIdx = prompt.indexOf("## Locked brand-voice rules");
    const fragmentsBlock = prompt.slice(fragmentsIdx, rulesIdx);
    expect(fragmentsBlock).not.toContain(DEFAULT_VOICE_FRAGMENTS.after_hours_suffix);
  });

  it("renders 'no discount' line when discountCode is null", () => {
    const prompt = composeSystemPrompt(baseInput);
    expect(prompt).toContain("Discount available this turn: none");
  });

  it("renders the discount code when provided", () => {
    const prompt = composeSystemPrompt({
      ...baseInput,
      discountCode: { code: "TEXT15", description: "15% off site-wide" },
    });
    expect(prompt).toContain('"TEXT15"');
    expect(prompt).toContain("15% off site-wide");
  });

  it("renders anonymous-visitor line when customerContext is null", () => {
    const prompt = composeSystemPrompt(baseInput);
    expect(prompt).toContain("Visitor: anonymous");
  });

  it("renders logged-in customer line when customerContext is provided", () => {
    const prompt = composeSystemPrompt({
      ...baseInput,
      customerContext: { firstName: "Naomi", lastOrderSummary: "Violet 4-pack" },
    });
    expect(prompt).toContain("Visitor: logged-in Shopify customer.");
    expect(prompt).toContain("First name: Naomi.");
    expect(prompt).toContain("Last order: Violet 4-pack.");
  });

  it("falls back gracefully when no chunks are retrieved", () => {
    const prompt = composeSystemPrompt(baseInput);
    expect(prompt).toContain("No retrieval context for this turn");
  });

  it("renders retrieved chunks with tier + source metadata", () => {
    const prompt = composeSystemPrompt({
      ...baseInput,
      retrievedChunks: [
        {
          id: "c1",
          source_type: "faq_kb",
          source_id: "faq:product-info:reusable",
          tier: 1,
          title: "Are CocoLash lashes reusable?",
          content: "Single-use up to 7 days.",
          metadata: { category: "Product Information" },
          content_hash: "abc",
          embedding: null,
          embedding_model: "text-embedding-3-small",
          created_at: "2026-05-02T00:00:00Z",
          updated_at: "2026-05-02T00:00:00Z",
        },
      ],
    });
    expect(prompt).toContain("Source 1");
    expect(prompt).toContain("tier 1");
    expect(prompt).toContain("faq_kb/faq:product-info:reusable");
    expect(prompt).toContain("Are CocoLash lashes reusable?");
  });

  it("ends with the voice rules version footer", () => {
    const prompt = composeSystemPrompt(baseInput);
    expect(prompt).toContain(`voice rules version: ${VOICE_RULES_VERSION}`);
  });
});
