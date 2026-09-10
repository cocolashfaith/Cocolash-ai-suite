/**
 * Package C — lib/brand/prompt-validator.
 *
 * The regression that started all of this: a Step-1 script said the CocoLash
 * full kit has a "glass cover". It does not — there is no glass anywhere on any
 * CocoLash product — and the claim rode all the way through the Director into
 * the rendered video (docs/seedance-2.5/05-GROUNDING-FIX.md §1).
 *
 * The two rules the fix has to satisfy:
 *   G4 — auto-correct rather than block, and report every change;
 *   G5 — the outgoing prompt is POSITIVE ONLY. "no glass cover" is worse than
 *        useless: a video model has no operator for "not" and will happily
 *        render the negated noun. So the assertion below is not just "the
 *        prompt changed", it is "the prompt no longer contains a negation".
 */

import { describe, it, expect } from "vitest";
import { validateAndCorrectPrompt } from "@/lib/brand/prompt-validator";
import { getProductTruthBySku } from "@/lib/brand/product-truth";
import type { ProductFacts } from "@/lib/ai/director/product-fact-extractor";

/**
 * Any word that turns a description into an instruction to omit something.
 * Seedance renders the noun anyway, which is precisely the failure mode G5
 * exists to prevent.
 */
const NEGATION =
  /\b(?:no|not|never|without|none|avoid|lacking|absent|isn'?t|aren'?t|doesn'?t|don'?t|won'?t)\b|\bfree\s+of\b|-free\b/i;

const KIT = getProductTruthBySku("kit-daisy")!;
const TRAY = getProductTruthBySku("poppy")!;

function facts(overrides: Partial<ProductFacts> = {}): ProductFacts {
  return {
    productType: "full lash kit",
    packaging: "tan rigid box with a book-style lid",
    lashStyle: "wispy cluster lashes",
    colorsAndFinish: "matte tan exterior, black interior",
    visibleText: "COCOLASH",
    notableDetails: "die-cut insert with a fitted cut-out per tool",
    isNot: [],
    summary: "A tan full lash kit box holding six tools.",
    ...overrides,
  };
}

describe('the "glass cover" regression', () => {
  const prompt =
    "She lifts the CocoLash kit box to camera and pops open the glass cover, " +
    "revealing the fitted tray of tools underneath.";

  const result = validateAndCorrectPrompt({
    prompt,
    truth: KIT,
    sku: "kit-daisy",
  });

  it("corrects the invented claim", () => {
    expect(result.prompt).not.toBe(prompt);
    expect(result.prompt.toLowerCase()).not.toContain("glass");
  });

  it("replaces it with what the lid actually is", () => {
    expect(result.prompt).toContain("book-style matte tan rigid board lid");
  });

  it("emits NO negation into the outgoing prompt (G5)", () => {
    expect(result.prompt).not.toMatch(NEGATION);
  });

  it("reports the change so the UI can show it (G4)", () => {
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].claim).toBe("glass cover");
    expect(result.corrections[0].replacement).toBe(
      "book-style matte tan rigid board lid"
    );
    expect(result.corrections[0].reason).toContain("CocoLash Kit - Daisy");
  });

  it("leaves the rest of the prompt alone", () => {
    expect(result.prompt).toContain("She lifts the CocoLash kit box to camera");
    expect(result.prompt).toContain("revealing the fitted tray of tools underneath");
  });

  it("catches the other glass phrasings too", () => {
    for (const claim of [
      "glass lid",
      "glass panel",
      "crystal display case",
      "glass front",
    ]) {
      const out = validateAndCorrectPrompt({
        prompt: `A close-up of the ${claim} catching the light.`,
        truth: KIT,
      });
      expect(out.corrections.length, claim).toBe(1);
      expect(out.prompt.toLowerCase(), claim).not.toContain("glass");
      expect(out.prompt.toLowerCase(), claim).not.toContain("crystal");
      expect(out.prompt, claim).not.toMatch(NEGATION);
    }
  });
});

describe("claims the images actually support are left alone", () => {
  it("keeps the mirror — it is really there on the full kit", () => {
    const prompt = "The mirrored lid reflects the tray as she opens the box.";
    const out = validateAndCorrectPrompt({ prompt, truth: KIT });
    expect(out.prompt).toBe(prompt);
    expect(out.corrections).toEqual([]);
  });

  it("keeps a magnetic claim on a kit — kits genuinely are magnetic", () => {
    const prompt = "The magnetic closure clicks shut with a satisfying snap.";
    const out = validateAndCorrectPrompt({ prompt, truth: KIT, sku: "kit-daisy" });
    expect(out.prompt).toBe(prompt);
    expect(out.corrections).toEqual([]);
  });

  it('keeps "clear plastic inner cover" on the round lash case', () => {
    // §1: the lashes sit under a clear PLASTIC cover. Substantially true, and
    // over-correcting it would be its own kind of dishonesty.
    const prompt = "She pops the clear plastic cover off the round lash case.";
    const out = validateAndCorrectPrompt({ prompt, truth: KIT });
    expect(out.prompt).toBe(prompt);
  });
});

describe("magnetic closure on packaging that has none", () => {
  it("rewrites it into the lid the tray really has", () => {
    const out = validateAndCorrectPrompt({
      prompt: "She slides the magnetic lid off the lash tray.",
      truth: TRAY,
      sku: "poppy",
    });
    expect(out.prompt).toBe("She slides the lift-off lid off the lash tray.");
    expect(out.prompt).not.toMatch(NEGATION);
    expect(out.corrections[0].claim).toBe("magnetic lid");
  });

  it("rewrites a magnetic closure into a lift-off lid", () => {
    const out = validateAndCorrectPrompt({
      prompt: "The magnetic closure keeps the tray shut.",
      truth: TRAY,
    });
    expect(out.prompt).toContain("lift-off lid");
    expect(out.prompt).not.toContain("magnetic");
  });

  it("drops a bare adverb it cannot rewrite, without leaving debris", () => {
    const out = validateAndCorrectPrompt({
      prompt: "The tray closes magnetically in her hand.",
      truth: TRAY,
    });
    expect(out.prompt).toBe("The tray closes in her hand.");
    expect(out.corrections[0].replacement).toBeNull();
  });
});

describe("mirrors that are not there", () => {
  it("rewrites a mirrored lid on a tray into its real colour", () => {
    const out = validateAndCorrectPrompt({
      prompt: "The mirrored interior catches the light.",
      truth: { ...TRAY, interiorColor: "black" },
    });
    expect(out.prompt).toBe("The black interior catches the light.");
    expect(out.prompt).not.toMatch(NEGATION);
  });

  it("removes the clause when there is no honest colour to swap in", () => {
    const out = validateAndCorrectPrompt({
      prompt: "She tilts the tray, revealing a mirrored panel, and smiles.",
      truth: TRAY,
    });
    expect(out.prompt).toBe("She tilts the tray, and smiles.");
    expect(out.corrections[0].replacement).toBeNull();
    expect(out.prompt).not.toContain("mirror");
  });
});

describe("transparent packaging that is solid board", () => {
  it("rewrites a see-through window into the real surface", () => {
    const out = validateAndCorrectPrompt({
      prompt: "A transparent window shows the lashes inside.",
      truth: KIT,
    });
    expect(out.prompt).toContain("book-style matte tan rigid board lid");
    expect(out.prompt).not.toContain("transparent");
    expect(out.prompt).not.toMatch(NEGATION);
  });

  it("leaves it alone when the truth row says nothing about transparency", () => {
    const prompt = "A transparent window shows the lashes inside.";
    const out = validateAndCorrectPrompt({ prompt, truth: TRAY });
    expect(out.prompt).toBe(prompt);
  });
});

describe("strip versus cluster — Faith's second failure case", () => {
  it("rewrites a strip claim on a cluster product", () => {
    const out = validateAndCorrectPrompt({
      prompt: "She peels a lash strip from the tray and places it.",
      truth: TRAY,
      sku: "poppy",
    });
    expect(out.prompt).toBe("She peels a lash cluster from the tray and places it.");
    expect(out.corrections[0].claim).toBe("lash strip");
  });

  it("keeps the plural when the claim was plural", () => {
    const out = validateAndCorrectPrompt({
      prompt: "She fans out the strip lashes on the counter.",
      truth: TRAY,
    });
    expect(out.prompt).toBe("She fans out the lash clusters on the counter.");
  });

  it("rewrites a strip claim on a half-lash kit into half lashes", () => {
    const out = validateAndCorrectPrompt({
      prompt: "The strip lashes go on in seconds.",
      truth: getProductTruthBySku("fern")!,
    });
    expect(out.prompt).toContain("half lashes");
  });
});

describe("materials", () => {
  it("corrects the band material to the one the product uses", () => {
    const out = validateAndCorrectPrompt({
      prompt: "The plastic band bends with her finger.",
      truth: TRAY,
    });
    expect(out.prompt).toBe("The cotton band bends with her finger.");
  });

  it("leaves a correct band claim untouched", () => {
    const prompt = "The cotton band bends with her finger.";
    expect(validateAndCorrectPrompt({ prompt, truth: TRAY }).prompt).toBe(prompt);
  });

  it("corrects leather packaging into the real material", () => {
    const out = validateAndCorrectPrompt({
      prompt: "The premium leather case sits on the vanity.",
      truth: KIT,
    });
    expect(out.prompt).toBe("The premium rigid board case sits on the vanity.");
  });

  it("corrects velvet and marble the same way", () => {
    for (const claim of ["velvet box", "marble tray"]) {
      const out = validateAndCorrectPrompt({
        prompt: `A ${claim} on the counter.`,
        truth: KIT,
      });
      expect(out.corrections.length, claim).toBe(1);
      expect(out.prompt, claim).toContain("rigid board");
    }
  });
});

describe("unknown input is a no-op", () => {
  const glassy =
    "She pops open the glass cover, showing the magnetic lid and a leather case.";

  it("returns an unknown SKU's prompt byte-identical", () => {
    const out = validateAndCorrectPrompt({ prompt: glassy, sku: "not-a-real-sku" });
    expect(out.prompt).toBe(glassy);
    expect(out.corrections).toEqual([]);
  });

  it("returns the prompt unchanged with no sku, truth or facts at all", () => {
    const out = validateAndCorrectPrompt({ prompt: glassy });
    expect(out.prompt).toBe(glassy);
    expect(out.corrections).toEqual([]);
  });

  it("handles null truth and null facts", () => {
    const out = validateAndCorrectPrompt({
      prompt: glassy,
      truth: null,
      facts: null,
      sku: null,
    });
    expect(out.prompt).toBe(glassy);
    expect(out.corrections).toEqual([]);
  });

  it("handles an empty prompt", () => {
    expect(validateAndCorrectPrompt({ prompt: "", truth: KIT })).toEqual({
      prompt: "",
      corrections: [],
    });
    expect(validateAndCorrectPrompt({ prompt: "   ", truth: KIT }).corrections).toEqual(
      []
    );
  });

  it("returns the same string reference when nothing is corrected", () => {
    const prompt = "A warm close-up of her lashes in golden light.";
    expect(validateAndCorrectPrompt({ prompt, truth: KIT }).prompt).toBe(prompt);
  });
});

describe("extracted facts alone are enough to catch a claim", () => {
  it("corrects glass with facts and no truth row", () => {
    const out = validateAndCorrectPrompt({
      prompt: "The glass lid catches the light.",
      facts: facts(),
    });
    expect(out.prompt).not.toContain("glass");
    expect(out.prompt).toContain("tan rigid box with a book-style lid");
    expect(out.prompt).not.toMatch(NEGATION);
  });

  it("uses the isNot list to correct a mirror the images do not show", () => {
    const out = validateAndCorrectPrompt({
      prompt: "The mirrored lid reflects her face.",
      facts: facts({ isNot: ["no mirror in the lid"] }),
    });
    expect(out.corrections).toHaveLength(1);
    expect(out.prompt).not.toContain("mirror");
    expect(out.prompt).not.toMatch(NEGATION);
  });

  it("does NOT correct a feature the images confirm", () => {
    const prompt = "The glass lid catches the light.";
    const out = validateAndCorrectPrompt({
      prompt,
      facts: facts({ packaging: "a glass-topped display box" }),
    });
    expect(out.prompt).toBe(prompt);
  });
});

describe("purity and safety", () => {
  it("does not mutate its input", () => {
    const input = {
      prompt: "The glass cover opens.",
      truth: KIT,
      sku: "kit-daisy",
    };
    const snapshot = JSON.stringify(input);
    validateAndCorrectPrompt(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("is deterministic", () => {
    const input = { prompt: "The glass cover and magnetic lid.", truth: TRAY };
    expect(validateAndCorrectPrompt(input)).toEqual(validateAndCorrectPrompt(input));
  });

  it("never emits a negation, whatever it corrects", () => {
    const kitchenSink =
      "She opens the glass cover of the leather case, past the magnetic clasp " +
      "and a transparent panel, peels a lash strip with the plastic band, and " +
      "the mirrored inside shows her smile.";
    for (const truth of [KIT, TRAY]) {
      const out = validateAndCorrectPrompt({ prompt: kitchenSink, truth });
      expect(out.corrections.length).toBeGreaterThan(2);
      expect(out.prompt).not.toMatch(NEGATION);
      expect(out.prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("terminates on a prompt that repeats the same claim many times", () => {
    const prompt = Array.from({ length: 40 }, () => "the glass cover").join(", ") + ".";
    const out = validateAndCorrectPrompt({ prompt, truth: KIT });
    expect(out.corrections.length).toBeLessThanOrEqual(12);
    expect(out.prompt).not.toMatch(NEGATION);
  });
});

/**
 * Found by running the validator against the real failing prompt rather than
 * trusting the rule list (2026-09-10).
 *
 * A prompt names the product once in full ("peels the lash strip off the tray")
 * and then refers back to it bare ("lays the strip along her lash line"). The
 * `lash-format` rule only caught the qualified form, so the second mention
 * still shipped the word *strip* to Enhancor — which is exactly the render
 * Faith reported. The `lash-format-bare` rule closes that, and must do so
 * without eating ordinary English.
 */
describe("bare 'strip' references (lash-format-bare)", () => {
  it("corrects a bare back-reference as well as the qualified mention", () => {
    const result = validateAndCorrectPrompt({
      prompt:
        "She peels the lash strip off the tray and lays the strip along her lash line.",
      truth: KIT,
      sku: KIT.sku,
    });

    expect(result.prompt).not.toMatch(/\bstrips?\b/i);
    expect(result.corrections.length).toBeGreaterThanOrEqual(2);
    expect(result.prompt).not.toMatch(NEGATION);
  });

  it("leaves ordinary uses of the word 'strip' alone", () => {
    const prompt =
      "A strip of warm light falls across her face and she tears strips of tape from the roll.";
    const result = validateAndCorrectPrompt({ prompt, truth: KIT, sku: KIT.sku });

    expect(result.prompt).toBe(prompt);
    expect(result.corrections).toHaveLength(0);
  });

  it("does not fire when the product really is a strip lash", () => {
    const stripTruth = { ...KIT, lashType: "strips" as const };
    const prompt = "She lays the strip along her lash line.";
    const result = validateAndCorrectPrompt({
      prompt,
      truth: stripTruth,
      sku: stripTruth.sku,
    });

    expect(result.prompt).toBe(prompt);
  });
});
