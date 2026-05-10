import { describe, it, expect } from "vitest";
import { MULTI_FRAME_DIRECTOR_PROMPT } from "@/lib/ai/director/system-prompts";

/**
 * Phase 27, Wave-6 (27-09) regression test for review finding #1.
 *
 * Multi-Frame mode is text-only (Enhancor accepts no reference images for
 * multi_frame). The fresh-context review (27-REVIEWS.md) flagged that the
 * universal prelude says "restate product properties" but the
 * MULTI_FRAME_DIRECTOR_PROMPT itself did not force per-segment restatement,
 * so segment 3 could hallucinate a magnetic closure even when segment 1 was
 * correct.
 *
 * Wave-6 added an explicit non-negotiable restatement rule. This test locks
 * that contract — future prompt refactors that drop the per-segment
 * restatement language will fail CI.
 */
describe("Multi-Frame product-anchor restatement contract", () => {
  it("MULTI_FRAME prompt declares per-segment restatement as non-negotiable", () => {
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(
      /Per-segment restatement rule.*NON-NEGOTIABLE/i
    );
  });

  it("MULTI_FRAME prompt instructs Director to restate product anchor every segment", () => {
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(
      /restate.*product anchor|product anchor.*restate|restate.*every segment/i
    );
  });

  it("MULTI_FRAME prompt forbids product-property drift across segments", () => {
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(
      /do\s*not\s*vary|drift.*hallucination|identical(ly)?\s+(across|in every)/i
    );
  });

  it("MULTI_FRAME prompt enumerates the canonical product-property fields to restate", () => {
    // The restatement rule names the literal property list so the Director
    // knows WHICH fields must remain identical across segments.
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/lashType/);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/bandMaterial/);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/magneticClosure/);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/packagingType/);
  });

  it("example preambles demonstrate full property restatement (not partial)", () => {
    // Segment 2 example must show the same product anchor as segment 1.
    // "Same CocoLash Violet" is the canonical example we wrote — if it goes
    // missing on a refactor, this test catches it.
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/Same CocoLash/i);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/non-magnetic/i);
  });
});
