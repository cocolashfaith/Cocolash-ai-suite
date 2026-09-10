import { describe, it, expect } from "vitest";
import { BRAND_NEGATIVE_PROMPT } from "@/lib/ai/director/negative-prompts";
import {
  UGC_DIRECTOR_PROMPT,
  MULTI_REFERENCE_DIRECTOR_PROMPT,
  MULTI_FRAME_DIRECTOR_PROMPT,
  LIPSYNCING_DIRECTOR_PROMPT,
  FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT,
  TEXT_TO_VIDEO_DIRECTOR_PROMPT,
} from "@/lib/ai/director/system-prompts";

/**
 * Rewritten 2026-09-10 (docs/seedance-2.5/05-GROUNDING-FIX.md, decision G5).
 *
 * These tests used to assert the literal strings "no lash strips when product is
 * clusters" and "no magnetic closure on non-magnetic packaging", and that the
 * block was headed "append to every output".
 *
 * That framing was the bug. Enhancor has no `negative_prompt` field — the video
 * model gets ONE prompt string — so a Director following "append to every
 * output" would put the word *strips* on the wire, and video models frequently
 * render the noun you negate. The constraints are now AUTHORING rules for the
 * prompt writer, and the same guarantees are enforced downstream by
 * `lib/brand/prompt-validator.ts`.
 *
 * The intent under test is unchanged: a magnetic closure must never be claimed
 * on non-magnetic packaging, a cluster lash must never be called a strip, and
 * kit contents must never be invented.
 */
describe("Product-accuracy authoring rules", () => {
  it("forbids naming a lash format that is not visible", () => {
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/lash format ONLY as it appears/i);
  });

  it("restricts packaging and closure claims to what is visible or in productTruth", () => {
    expect(BRAND_NEGATIVE_PROMPT).toMatch(
      /packaging, closures, lids, mirrors and materials ONLY when visible/i
    );
  });

  it("forbids inventing kit contents", () => {
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/list only items you can see/i);
  });

  it("tells the Director to drop unverifiable script claims", () => {
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/do not stage\s+it/i);
  });

  it("is reachable from every Director system prompt", () => {
    const prompts = [
      UGC_DIRECTOR_PROMPT,
      MULTI_REFERENCE_DIRECTOR_PROMPT,
      MULTI_FRAME_DIRECTOR_PROMPT,
      LIPSYNCING_DIRECTOR_PROMPT,
      FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT,
      TEXT_TO_VIDEO_DIRECTOR_PROMPT,
    ];

    for (const prompt of prompts) {
      expect(prompt, "Each Director prompt should include the authoring rules").toContain(
        BRAND_NEGATIVE_PROMPT
      );
    }
  });

  it("is a non-empty string", () => {
    expect(typeof BRAND_NEGATIVE_PROMPT).toBe("string");
    expect(BRAND_NEGATIVE_PROMPT.length).toBeGreaterThan(0);
  });
});

/**
 * The regression that matters: nothing in this block may instruct the Director
 * to copy negations into its output, and the block must not hand the model a
 * ready-made "no <product noun>" line it can paste onto the wire.
 */
describe("G5 — no negations may reach the outgoing prompt", () => {
  it("never tells the Director to append these constraints to its output", () => {
    expect(BRAND_NEGATIVE_PROMPT).not.toMatch(/append to every output/i);
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/Never copy these lines/i);
  });

  it("contains no ready-to-paste negation naming a lash format or packaging", () => {
    const forbidden = [
      /no lash strips?\b/i,
      /no magnetic closure/i,
      /no kit contents/i,
      /\bNOT a (serum|face|lip)/i,
    ];
    for (const pattern of forbidden) {
      expect(
        BRAND_NEGATIVE_PROMPT,
        `Authoring rules must not contain a pasteable negation: ${pattern}`
      ).not.toMatch(pattern);
    }
  });

  it("explains why negation is unsafe, so the rule survives future edits", () => {
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/negated noun is often rendered anyway/i);
  });
});
