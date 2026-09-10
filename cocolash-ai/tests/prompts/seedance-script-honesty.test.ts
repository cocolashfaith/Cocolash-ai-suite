/**
 * Package A — "glass cover" regression guards for the SCRIPT WRITER.
 *
 * Ground truth (docs/seedance-2.5/05-GROUNDING-FIX.md §1): the CocoLash full
 * kit has a tan book-style lid, a real mirror inside it, a black tray — and no
 * glass anywhere. The script writer, which sees no images at all, invented "a
 * glass cover" and that claim flowed verbatim into the video prompt.
 *
 * These tests pin the four prompt-level fixes:
 *   G1  the script may never describe physical appearance,
 *   G3  the generic brand claims are a fallback, not a constant,
 *   §4A the real product name replaces the blind placeholder,
 *   §4A the unboxing framework no longer orders invented packaging detail.
 */

import { describe, it, expect } from "vitest";
import {
  buildSeedanceScriptSystemPrompt,
  buildSeedanceScriptUserPrompt,
  SCRIPT_NO_PHYSICAL_DESCRIPTION_RULE,
} from "@/lib/prompts/scripts/seedance";
import type { CampaignType } from "@/lib/types";

const FACTS_BLOCK = `WHAT THE PRODUCT ACTUALLY IS (analyzed from its own images — this is the source of truth):
- Product: full lash kit in a tan rigid box
- Packaging: book-style lid with a mirror set into the inside face
- Do NOT claim (not present in the images): no glass panel; no glass cover
Ground every product reference in these facts.`;

const SEEDANCE_CAMPAIGNS: CampaignType[] = [
  "product-showcase",
  "testimonial",
  "promo",
  "educational",
  "unboxing",
  "before-after",
];

describe("G1 — the script system prompt bans physical description", () => {
  const system = buildSeedanceScriptSystemPrompt();

  it("carries the no-physical-description rule verbatim", () => {
    expect(system).toContain(SCRIPT_NO_PHYSICAL_DESCRIPTION_RULE);
  });

  it("names the rule as outranking every other rule", () => {
    expect(system).toMatch(/OUTRANKS EVERY OTHER RULE/i);
  });

  it("bans each category of physical claim the bug produced", () => {
    for (const banned of [
      "packaging",
      "lids",
      "closures",
      "glass",
      "transparency",
      "mirrors",
      "colours",
      "construction",
    ]) {
      expect(system.toLowerCase(), `missing ban: ${banned}`).toContain(banned);
    }
  });

  it("gives concrete banned phrasing, including the exact failure", () => {
    expect(system).toContain("glass cover");
    expect(system).toContain("clear lid");
    expect(system).toMatch(/BANNED PHRASING/);
  });

  it("still permits naming the product and selling the benefit", () => {
    expect(system).toMatch(/YOU MAY: name the product/i);
    expect(system).toMatch(/how it feels to wear/i);
  });

  it("tells the writer appearance belongs to the visual layer", () => {
    expect(system).toMatch(/false claim in the finished video/i);
  });

  it("repeats the rule as a final check in every user prompt", () => {
    for (const campaignType of SEEDANCE_CAMPAIGNS) {
      const prompt = buildSeedanceScriptUserPrompt({
        campaignType,
        tone: "casual",
        duration: 8,
      });
      expect(prompt, campaignType).toMatch(
        /delete any phrase that describes what the product looks like/i
      );
    }
  });
});

describe("§4A — the real product name replaces the blind placeholder", () => {
  it("uses the supplied product name as the PRODUCT line", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "unboxing",
      tone: "casual",
      duration: 10,
      productName: "CocoLash Full Lash Kit",
      productFacts: FACTS_BLOCK,
    });
    expect(prompt).toContain("PRODUCT: CocoLash Full Lash Kit");
    expect(prompt).not.toContain("CocoLash premium false lashes");
  });

  it("forbids inventing a different name or a look for it", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "unboxing",
      tone: "casual",
      duration: 10,
      productName: "CocoLash Full Lash Kit",
    });
    expect(prompt).toMatch(/Call the product by that name/i);
    expect(prompt).toMatch(/any description of how it looks/i);
  });

  it("never falls back to the old blind placeholder string", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
    });
    expect(prompt).not.toContain("CocoLash premium false lashes");
    expect(prompt).toContain("PRODUCT: CocoLash lashes");
  });
});

describe("G3 — generic brand claims are a fallback, not a constant", () => {
  it("omits the five generic claims when extracted facts exist", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
      productFacts: FACTS_BLOCK,
    });
    expect(prompt).toContain("WHAT THE PRODUCT ACTUALLY IS");
    expect(prompt).not.toMatch(/GENERIC BRAND FACTS/);
    // The five generic bullets, verbatim — none may reach a grounded script.
    expect(prompt).not.toContain("Flexible cotton band for comfort");
    expect(prompt).not.toContain("Reusable 25+ wears with proper care");
    expect(prompt).not.toContain("Lightweight enough for all-day wear");
    expect(prompt).not.toContain("Cruelty-free and vegan");
    expect(prompt).not.toContain(
      "Premium false lashes made for Black women and diverse eye shapes"
    );
  });

  it("uses the generic claims only when no facts were extracted", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
    });
    expect(prompt).toMatch(/GENERIC BRAND FACTS/);
    expect(prompt).toMatch(/cotton band/i);
    expect(prompt).toMatch(/fallback only/i);
  });

  it("states that analysed facts win over anything generic", () => {
    const withFacts = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
      productFacts: FACTS_BLOCK,
    });
    expect(withFacts).toMatch(/these facts win/i);
    expect(withFacts).toMatch(/Anything not listed there does not exist/i);

    const withoutFacts = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
    });
    expect(withoutFacts).toMatch(/the analysed facts win/i);
  });

  it("treats the facts as reference, not as lines to read out", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "unboxing",
      tone: "casual",
      duration: 10,
      productFacts: FACTS_BLOCK,
    });
    expect(prompt).toMatch(/do not read them out/i);
    expect(prompt).toMatch(/NOT a script/i);
  });
});

describe("§4A — the unboxing framework no longer invents packaging", () => {
  const unboxing = buildSeedanceScriptUserPrompt({
    campaignType: "unboxing",
    tone: "casual",
    duration: 15,
  });

  it("dropped the 'tactile detail: fibers, softness, band, tray, packaging' beat", () => {
    expect(unboxing).not.toMatch(/Tactile detail/i);
    expect(unboxing).not.toMatch(/fibers, softness/i);
  });

  it("dropped 'opening or presenting packaging' from the motion beats", () => {
    expect(unboxing).not.toMatch(/opening or presenting packaging/i);
    expect(unboxing).not.toMatch(/lifting lash tray/i);
  });

  it("replaces them with anticipation, reaction and result beats", () => {
    expect(unboxing).toMatch(/Anticipation/i);
    expect(unboxing).toMatch(/react, do not describe it/i);
    expect(unboxing).toMatch(/Honest first reaction/i);
    expect(unboxing).toMatch(/Result she is expecting/i);
  });

  it("explicitly tells the unboxing writer not to describe the packaging", () => {
    expect(unboxing).toMatch(
      /describing what the product or its packaging looks like/i
    );
  });

  it("no seedance framework beat names packaging or its parts", () => {
    // Everything between the framework header and AVOID: is what the writer is
    // told to DO. Physical nouns are only allowed in the AVOID / ban sections.
    for (const campaignType of SEEDANCE_CAMPAIGNS) {
      const prompt = buildSeedanceScriptUserPrompt({
        campaignType,
        tone: "casual",
        duration: 10,
      });
      const start = prompt.indexOf("SCRIPT FRAMEWORK:");
      const end = prompt.indexOf("AVOID:");
      expect(start, campaignType).toBeGreaterThan(-1);
      expect(end, campaignType).toBeGreaterThan(start);
      const instructions = prompt.slice(start, end);
      expect(instructions, campaignType).not.toMatch(
        /packaging|\bbox\b|\btray\b|\bcase\b|\blid\b|fibers?|cotton/i
      );
    }
  });

  it("no campaign focus area orders a packaging description", () => {
    for (const campaignType of SEEDANCE_CAMPAIGNS) {
      const prompt = buildSeedanceScriptUserPrompt({
        campaignType,
        tone: "casual",
        duration: 10,
      });
      const start = prompt.indexOf("CAMPAIGN FOCUS AREAS:");
      if (start === -1) continue;
      const focus = prompt.slice(start, prompt.indexOf("\n\n", start));
      expect(focus, campaignType).not.toMatch(
        /packaging|\bbox\b|\btray\b|unboxing|fibers?|cotton band/i
      );
    }
  });
});
