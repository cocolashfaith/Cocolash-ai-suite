import { describe, it, expect } from "vitest";
import {
  UGC_DIRECTOR_PROMPT,
  MULTI_REFERENCE_DIRECTOR_PROMPT,
  MULTI_FRAME_DIRECTOR_PROMPT,
  LIPSYNCING_DIRECTOR_PROMPT,
  FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT,
  TEXT_TO_VIDEO_DIRECTOR_PROMPT,
} from "@/lib/ai/director/system-prompts";

describe("Subject Anchor Block — All Director Prompts", () => {
  const prompts = [
    { name: "UGC", prompt: UGC_DIRECTOR_PROMPT },
    { name: "Multi-Reference", prompt: MULTI_REFERENCE_DIRECTOR_PROMPT },
    { name: "Multi-Frame", prompt: MULTI_FRAME_DIRECTOR_PROMPT },
    { name: "Lip-Sync", prompt: LIPSYNCING_DIRECTOR_PROMPT },
    { name: "First+Last Frame", prompt: FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT },
    { name: "Text-to-Video", prompt: TEXT_TO_VIDEO_DIRECTOR_PROMPT },
  ];

  it("every Director prompt references 'Subject:' anchor header", () => {
    for (const { name, prompt } of prompts) {
      expect(prompt, `${name} prompt should contain 'Subject:' anchor`).toMatch(/Subject:/);
    }
  });

  it("every Director prompt references 'Product:' anchor header (for product grounding)", () => {
    for (const { name, prompt } of prompts) {
      // Product anchor ensures product properties are tracked textually
      expect(prompt, `${name} prompt should contain 'Product:' anchor`).toMatch(/Product:/);
    }
  });

  it("UGC prompt contains subject anchor block template", () => {
    expect(UGC_DIRECTOR_PROMPT).toContain("Subject:");
    expect(UGC_DIRECTOR_PROMPT).toContain("Product:");
  });

  it("Multi-Reference prompt contains explicit role labeling for assets", () => {
    // Multi-reference is asset-driven, so subject anchor is in context
    expect(MULTI_REFERENCE_DIRECTOR_PROMPT).toMatch(/@image/);
    expect(MULTI_REFERENCE_DIRECTOR_PROMPT).toMatch(/role.*label/i);
  });

  it("Multi-Frame prompt teaches subject and product description via text", () => {
    // Multi-frame has no images, so subject/product are ONLY in text
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/\[Subject.*anchor\]/i);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/describe.*appearance/i);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/lashType/);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/bandMaterial/);
  });

  it("Lip-Sync prompt opens with subject anchor block", () => {
    expect(LIPSYNCING_DIRECTOR_PROMPT).toMatch(/Open with the subject anchor block/i);
  });

  it("First+Last Frames prompt includes identity stability constraints", () => {
    // First+Last frames needs strong subject anchoring for continuity
    expect(FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT).toMatch(/identity/i);
    expect(FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT).toMatch(/stable/i);
  });

  it("Text-to-Video prompt includes subject and environment grounding", () => {
    // Text-to-video is scene-driven, but should still ground subject + product
    expect(TEXT_TO_VIDEO_DIRECTOR_PROMPT).toMatch(/subject|product|scene/i);
  });

  it("all prompts include UNIVERSAL_PRELUDE with product-truth language", () => {
    // Verify that all six are built on the universal prelude
    const expectedUniversalContent = "productTruth";
    for (const { name, prompt } of prompts) {
      expect(prompt, `${name} should include product-truth language`).toContain(
        expectedUniversalContent
      );
    }
  });

  it("all prompts forbid inventing product properties not in productTruth", () => {
    const expectedContent = "Never invent";
    for (const { name, prompt } of prompts) {
      expect(prompt, `${name} should forbid inventing product properties`).toMatch(
        /never invent/i
      );
    }
  });
});
