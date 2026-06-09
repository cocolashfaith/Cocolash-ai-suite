/**
 * Phase 34.1 Group D (R-34.1-04) — product fact extractor.
 *
 * Covers the pure, network-free parts: input validation, lenient JSON parsing
 * (incl. graceful degradation), and the prompt-block formatter that both the
 * script generator and the Step-3 prompt agent consume.
 */

import { describe, it, expect } from "vitest";
import {
  extractProductFacts,
  parseProductFacts,
  formatProductFactsForPrompt,
  ProductFactExtractorError,
  type ProductFacts,
} from "@/lib/ai/director/product-fact-extractor";

describe("extractProductFacts input validation", () => {
  it("rejects an empty image array", async () => {
    await expect(extractProductFacts([])).rejects.toBeInstanceOf(
      ProductFactExtractorError
    );
  });

  it("rejects more than 9 images", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://x/${i}.png`);
    await expect(extractProductFacts(urls)).rejects.toThrow(/exceeds 9/i);
  });

  it("rejects non-HTTPS image URLs", async () => {
    await expect(
      extractProductFacts(["http://insecure/p.png"])
    ).rejects.toThrow(/HTTPS/i);
  });
});

describe("parseProductFacts", () => {
  it("parses a clean JSON fact sheet", () => {
    const raw = JSON.stringify({
      productType: "multi-lash book",
      packaging: "black book-style box",
      lashStyle: "wispy clusters",
      colorsAndFinish: "matte black, rose-gold lettering",
      visibleText: "COCOLASH",
      notableDetails: "four pairs in a pink tray, round case",
      isNot: ["no magnetic closure"],
      summary: "A book-style set of four wispy cluster lash pairs.",
    });
    const facts = parseProductFacts(raw);
    expect(facts.productType).toBe("multi-lash book");
    expect(facts.isNot).toContain("no magnetic closure");
  });

  it("handles a fenced ```json block", () => {
    const raw = '```json\n{"productType":"lash tray","isNot":["no magnet"]}\n```';
    const facts = parseProductFacts(raw);
    expect(facts.productType).toBe("lash tray");
    expect(facts.isNot).toEqual(["no magnet"]);
  });

  it("coerces a non-array isNot into a single-item array", () => {
    const facts = parseProductFacts('{"isNot":"no magnetic closure"}');
    expect(facts.isNot).toEqual(["no magnetic closure"]);
  });

  it("degrades gracefully on non-JSON prose (keeps text as summary)", () => {
    const raw = "It's a black book-style box with four pairs of wispy lashes.";
    const facts = parseProductFacts(raw);
    expect(facts.summary).toContain("book-style box");
    expect(facts.productType).toBe("");
  });
});

describe("formatProductFactsForPrompt", () => {
  const facts: ProductFacts = {
    productType: "multi-lash book",
    packaging: "black book-style box",
    lashStyle: "wispy clusters",
    colorsAndFinish: "matte black, rose-gold lettering",
    visibleText: "COCOLASH",
    notableDetails: "round storage case",
    isNot: ["no magnetic closure", "not a single strip lash"],
    summary: "Four wispy cluster pairs in a book-style box.",
  };

  it("renders the key fields and the honesty guard", () => {
    const block = formatProductFactsForPrompt(facts);
    expect(block).toContain("black book-style box");
    expect(block).toContain("rose-gold lettering");
    expect(block).toMatch(/Do NOT claim/i);
    expect(block).toContain("no magnetic closure");
    expect(block).toMatch(/source of truth/i);
  });

  it("shows a placeholder when no packaging text is legible", () => {
    const block = formatProductFactsForPrompt({ ...facts, visibleText: "" });
    expect(block).toContain("(none legible)");
  });

  it("returns an empty string when there is nothing usable", () => {
    const block = formatProductFactsForPrompt({
      productType: "",
      packaging: "",
      lashStyle: "",
      colorsAndFinish: "",
      visibleText: "",
      notableDetails: "",
      isNot: [],
      summary: "",
    });
    // Only the "(none legible)" line would remain — but with no real content
    // and no summary the formatter yields an empty block.
    expect(block).toBe("");
  });
});
