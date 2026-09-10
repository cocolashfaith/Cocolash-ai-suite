/**
 * lib/brand/prompt-validator.ts — the last honesty gate before a prompt is sent
 * to a video model.
 *
 * Context: a Step-1 script claimed the CocoLash full kit has a "glass cover".
 * It does not — there is no glass anywhere on any CocoLash product
 * (docs/seedance-2.5/05-GROUNDING-FIX.md §1). The claim survived every stage of
 * the pipeline and the video rendered a glass box.
 *
 * Two decisions shape everything in this file:
 *
 *   G4 — AUTO-CORRECT, DON'T BLOCK. A contradicted claim is rewritten here and
 *        the user is shown what changed. Every rewrite comes back in
 *        `corrections` so the UI can display it; a silent rewrite would just be
 *        a different kind of dishonesty.
 *
 *   G5 — POSITIVE DESCRIPTION ONLY. We never emit a negation. Writing
 *        "no glass cover" into a prompt makes a video model render a glass
 *        cover, because diffusion models have no operator for "not". So a false
 *        claim is replaced by an accurate POSITIVE phrase built from product
 *        truth ("book-style matte tan rigid board lid"), and when no accurate
 *        phrase can be built the clause is deleted instead.
 *
 * The module is pure and dependency-light on purpose — it runs on the request
 * path in front of `/queue`, it makes no network calls, and it imports
 * `ProductFacts` as a TYPE ONLY so none of the vision-model machinery is pulled
 * in at runtime.
 *
 * Unknown input is a no-op: with neither product truth nor extracted facts we
 * know nothing, and guessing would be the same failure mode we are fixing.
 */

import type { ProductFacts } from "@/lib/ai/director/product-fact-extractor";
import {
  getProductTruthBySku,
  type ProductTruthEntry,
} from "@/lib/brand/product-truth";

/** One rewrite the validator made, for display next to the prompt. */
export interface PromptCorrection {
  /** The exact text that was found in the prompt. */
  claim: string;
  /** What replaced it, or null when the clause was removed outright. */
  replacement: string | null;
  /** Why, in a sentence a non-engineer can read. */
  reason: string;
}

export interface ValidatedPrompt {
  /** The prompt as it should now go to the model. */
  prompt: string;
  /** Every change made, in the order it was made. Empty when nothing changed. */
  corrections: PromptCorrection[];
}

export interface ValidateAndCorrectPromptInput {
  prompt: string;
  /** Vision-extracted facts for the selected product images, when available. */
  facts?: ProductFacts | null;
  /** A resolved truth row. Takes precedence over `sku`. */
  truth?: ProductTruthEntry | null;
  /** Resolves to a truth row when `truth` was not passed. */
  sku?: string | null;
}

/** What the rules get to reason with. */
interface TruthContext {
  truth: ProductTruthEntry | null;
  facts: ProductFacts | null;
  /** Best available human name for the product, for the `reason` strings. */
  productName: string;
}

/**
 * A rewrite that would smuggle a negation back into the prompt is refused and
 * downgraded to a clause removal — see G5. This is a safety net, not the plan:
 * no rule is supposed to produce one.
 */
const NEGATION =
  /\b(?:no|not|never|without|none|avoid|lacking|absent|isn'?t|aren'?t|doesn'?t|don'?t|won'?t|free\s+of|instead\s+of|rather\s+than)\b|(?:^|\s)-free\b/i;

/** Nouns that all mean "the thing on top of the packaging". */
const LID_NOUNS = new Set([
  "cover",
  "lid",
  "panel",
  "top",
  "front",
  "dome",
  "display",
  "door",
  "pane",
  "window",
  "flap",
  "closure",
]);

// ── Phrase builders — every one of these produces POSITIVE text ─────────────

/** "book" → "book-style", "tray-lid" → "lift-off", etc. */
function lidAdjective(truth: ProductTruthEntry | null): string | null {
  switch (truth?.lidType) {
    case "book":
      return "book-style";
    case "hinged":
      return "hinged";
    case "slide":
      return "slide-out";
    case "tray-lid":
      return "lift-off";
    default:
      // "none" means there is no lid at all — describing one would be a new
      // invention, so contribute nothing.
      return null;
  }
}

/** Collapse the many words for "lid" down to the one the product actually has. */
function normaliseNoun(noun: string): string {
  const lower = noun.toLowerCase();
  return LID_NOUNS.has(lower) ? "lid" : lower;
}

/**
 * An accurate, positive description of a packaging surface — the replacement
 * for a "glass cover" or a "see-through panel".
 *
 * Built only from fields that are actually populated, so a product whose truth
 * row says nothing about materials degrades to the bare noun ("lid") rather
 * than to an invented one ("rigid printed lid"). Returns null when even the
 * noun would be misleading.
 */
function describeSurface(ctx: TruthContext, noun: string): string | null {
  const head = normaliseNoun(noun);
  const truth = ctx.truth;
  const parts: string[] = [];
  if (head === "lid") {
    const adj = lidAdjective(truth);
    if (adj) parts.push(adj);
  }
  if (truth?.finish) parts.push(truth.finish);
  if (truth?.exteriorColor) parts.push(truth.exteriorColor);
  if (truth?.boxMaterial) parts.push(truth.boxMaterial);

  if (parts.length === 0) {
    // Nothing from the truth row. The extracted facts describe the packaging in
    // the images, which is the next most reliable thing we have.
    const packaging = ctx.facts?.packaging?.trim();
    if (packaging && !/glass|crystal|transparent|see-through/i.test(packaging)) {
      return packaging;
    }
    return head;
  }
  return `${parts.join(" ")} ${head}`;
}

/**
 * How this product's lashes are actually shaped, matching the grammatical
 * number of the claim being replaced — "a lash strip" must become "a lash
 * cluster", not "a lash clusters".
 */
function lashFormatPhrase(
  truth: ProductTruthEntry | null,
  plural = true
): string | null {
  if (!truth) return null;
  const pick = (singular: string, many: string) => (plural ? many : singular);
  if (truth.lashType === "clusters") return pick("lash cluster", "lash clusters");
  if (truth.lashType === "strips") return pick("lash strip", "lash strips");
  if (truth.lashType === "kit") {
    const halfLash = (truth.kitContents ?? []).some((item) =>
      /half\s+lash/i.test(item)
    );
    return halfLash
      ? pick("half lash", "half lashes")
      : pick("lash cluster", "lash clusters");
  }
  return null;
}

/** Did the claim we matched refer to more than one lash? */
function isPluralClaim(claim: string): boolean {
  return /s\b/.test(claim.trim());
}

/** True when the vision pass explicitly listed this feature as absent. */
function factsDeny(facts: ProductFacts | null, ...keywords: string[]): boolean {
  if (!facts?.isNot?.length) return false;
  return facts.isNot.some((entry) => {
    const lower = String(entry).toLowerCase();
    return keywords.some((k) => lower.includes(k));
  });
}

/** True when the images DID show this feature, so a claim about it is fine. */
function factsConfirm(facts: ProductFacts | null, ...keywords: string[]): boolean {
  if (!facts) return false;
  const haystack = [
    facts.packaging,
    facts.colorsAndFinish,
    facts.notableDetails,
    facts.summary,
    facts.lashStyle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keywords.some((k) => haystack.includes(k));
}

// ── Rules ──────────────────────────────────────────────────────────────────

interface Rule {
  id: string;
  /** Must be sticky-searchable; the engine supplies its own lastIndex. */
  pattern: RegExp;
  /** Is this claim actually contradicted by what we know? */
  contradicts: (ctx: TruthContext, m: RegExpExecArray) => boolean;
  /** Accurate positive replacement, or null to delete the clause. */
  rewrite: (ctx: TruthContext, m: RegExpExecArray) => string | null;
  reason: (ctx: TruthContext, m: RegExpExecArray) => string;
}

const RULES: Rule[] = [
  {
    // The original bug. No CocoLash product has glass anywhere on it: the round
    // lash case has a clear PLASTIC inner cover, and the kit lid is board.
    id: "glass",
    pattern:
      /\b(glass|crystal)\s+(?:[a-z]+\s+){0,2}?(cover|lid|panel|window|top|case|box|front|dome|display|door|pane|flap|closure)\b/gi,
    contradicts: (ctx) => !factsConfirm(ctx.facts, "glass", "crystal"),
    rewrite: (ctx, m) => describeSurface(ctx, m[2]),
    reason: (ctx, m) =>
      `${ctx.productName} has no ${m[1].toLowerCase()} anywhere on it — the packaging is ${
        ctx.truth?.boxMaterial ?? ctx.truth?.packagingType ?? "opaque board"
      }.`,
  },
  {
    id: "transparent-window",
    pattern:
      /\b(transparent|see-through|see through)\s+(?:[a-z]+\s+){0,1}?(window|panel|lid|cover|front|box|case|packaging|top)\b|\bclear\s+(window)\b/gi,
    contradicts: (ctx) =>
      ctx.truth?.transparentWindow === false ||
      factsDeny(ctx.facts, "transparent", "see-through", "window"),
    rewrite: (ctx, m) => describeSurface(ctx, m[2] ?? m[3] ?? "lid"),
    reason: (ctx) =>
      `${ctx.productName} is not see-through — its packaging is solid ${
        ctx.truth?.boxMaterial ?? ctx.truth?.packagingType ?? "board"
      }.`,
  },
  {
    // A mirror is REAL on the full kit and invented anywhere else, which is
    // exactly why hasMirror had to become a field.
    id: "mirror",
    pattern:
      /\bmirror(?:ed)?\s+(lid|interior|inside|panel|inset|surface|underside|back|top|cover)\b|\bmirror\s+in(?:side)?\s+the\s+(lid|box|case|cover)\b/gi,
    contradicts: (ctx) =>
      ctx.truth?.hasMirror === false || factsDeny(ctx.facts, "mirror"),
    rewrite: (ctx, m) => {
      const noun = normaliseNoun(m[1] ?? m[2] ?? "lid");
      const colour =
        noun === "lid" ? ctx.truth?.exteriorColor : ctx.truth?.interiorColor;
      return colour ? `${colour} ${noun}` : null;
    },
    reason: (ctx) => `${ctx.productName} has no mirror set into its packaging.`,
  },
  {
    // Magnetic is TRUE for the full kits and false for every tray and book.
    id: "magnetic",
    pattern:
      /\bmagnetic\s+(closure|lid|box|seal|case|clasp|snap|click|close|pack|packaging|flap|cover|top)\b|\bmagnetically\b/gi,
    contradicts: (ctx) =>
      ctx.truth != null &&
      ctx.truth.magneticClosure !== true &&
      !factsConfirm(ctx.facts, "magnet"),
    rewrite: (ctx, m) => {
      if (!m[1]) return null; // bare "magnetically" — drop the adverb
      const noun = normaliseNoun(m[1]);
      const adj = lidAdjective(ctx.truth);
      return adj ? `${adj} ${noun}` : noun;
    },
    reason: (ctx) =>
      `${ctx.productName} closes with a ${
        lidAdjective(ctx.truth) ?? "plain"
      } lid, not a magnet.`,
  },
  {
    // Faith's second failure case: clusters rendering as strips.
    id: "lash-format",
    pattern: /\b(?:lash\s+strips?|strip\s+lashes|full\s+strips?|strip\s+lash)\b/gi,
    contradicts: (ctx) =>
      ctx.truth != null &&
      ctx.truth.lashType !== "strips" &&
      lashFormatPhrase(ctx.truth) != null,
    rewrite: (ctx, m) => lashFormatPhrase(ctx.truth, isPluralClaim(m[0])),
    reason: (ctx) =>
      `${ctx.productName} is sold as ${
        lashFormatPhrase(ctx.truth) ?? "clusters"
      }, so the prompt must say so or the model renders a strip.`,
  },
  {
    /**
     * The bare-noun follow-up to `lash-format`. A prompt routinely names the
     * product once ("she peels the lash strip off the tray") and then refers
     * back to it without the qualifier ("lays the strip along her lash line").
     * `lash-format` only catches the first; the second still puts *strip* on
     * the wire, which is exactly the render Faith complained about.
     *
     * Scoped tightly to a determiner + "strip(s)" and explicitly NOT followed
     * by "of", so ordinary English survives untouched: "a strip of warm light"
     * and "strips of tape" are left alone.
     */
    id: "lash-format-bare",
    pattern: /\b(the|a|an|this|that|each|one|her|his|their)\s+(strips?)\b(?!\s+of\b)/gi,
    contradicts: (ctx) =>
      ctx.truth != null &&
      ctx.truth.lashType !== "strips" &&
      lashFormatPhrase(ctx.truth) != null,
    rewrite: (ctx, m) => {
      const determiner = m[1];
      const phrase = lashFormatPhrase(ctx.truth, /s$/i.test(m[2]));
      return phrase ? `${determiner} ${phrase}` : null;
    },
    reason: (ctx) =>
      `${ctx.productName} is sold as ${
        lashFormatPhrase(ctx.truth) ?? "clusters"
      }; a bare "strip" later in the prompt still makes the model render one.`,
  },
  {
    id: "band-material",
    pattern: /\b(plastic|cotton|leather|silk|metal|rubber|fabric)\s+band\b/gi,
    contradicts: (ctx, m) =>
      ctx.truth != null && ctx.truth.bandMaterial !== m[1].toLowerCase(),
    rewrite: (ctx) =>
      ctx.truth && ctx.truth.bandMaterial !== "none"
        ? `${ctx.truth.bandMaterial} band`
        : null,
    reason: (ctx, m) =>
      ctx.truth?.bandMaterial && ctx.truth.bandMaterial !== "none"
        ? `${ctx.productName} uses a ${ctx.truth.bandMaterial} band, not ${m[1].toLowerCase()}.`
        : `${ctx.productName} has no lash band to describe.`,
  },
  {
    // Generalised from the old leather-only check: any material claimed about
    // the packaging that the truth row contradicts.
    id: "packaging-material",
    pattern:
      /\b(leather(?:ette)?|velvet|silk|suede|wooden|wood|metal|marble|bamboo|acrylic)\s+(case|box|pouch|packaging|tray|lid|cover|wallet|bag)\b/gi,
    contradicts: (ctx, m) => {
      if (!ctx.truth) return false;
      const known = `${ctx.truth.packagingType ?? ""} ${ctx.truth.boxMaterial ?? ""}`;
      const claimed = m[1].toLowerCase().replace(/ette$/, "");
      return !known.toLowerCase().includes(claimed);
    },
    rewrite: (ctx, m) => {
      const noun = m[2].toLowerCase();
      if (ctx.truth?.boxMaterial) return `${ctx.truth.boxMaterial} ${noun}`;
      return ctx.truth?.packagingType ?? null;
    },
    reason: (ctx, m) =>
      `${ctx.productName} packaging is ${
        ctx.truth?.boxMaterial ?? ctx.truth?.packagingType ?? "not"
      } ${m[1].toLowerCase()}.`,
  },
];

// ── Engine ─────────────────────────────────────────────────────────────────

/** Tidy the punctuation a clause removal leaves behind. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;])\s*([,.;])/g, "$2")
    .replace(/\(\s*\)/g, "")
    .replace(/^[\s,;]+/, "")
    .trimEnd();
}

/**
 * Delete a span, taking any connector that introduced it with it, so
 * "…the box, revealing a glass cover, and she smiles" does not become
 * "…the box, revealing, and she smiles".
 */
function removeSpan(
  text: string,
  start: number,
  end: number
): { text: string; index: number } {
  const before = text
    .slice(0, start)
    .replace(
      /[,;]?\s*\b(?:with|featuring|showing|revealing|including|behind|under|beneath|through)\b\s+(?:a|an|the)?\s*$/i,
      ""
    );
  const merged = tidy(before + text.slice(end));
  return { text: merged, index: Math.max(0, before.length - 1) };
}

/** Refuse any rewrite that would put a negation back into the prompt (G5). */
function safeRewrite(candidate: string | null): string | null {
  if (candidate == null) return null;
  const trimmed = candidate.trim().replace(/\s{2,}/g, " ");
  if (!trimmed || NEGATION.test(trimmed)) return null;
  return trimmed;
}

/** Bounded so a rewrite that re-matches its own pattern cannot spin. */
const MAX_REWRITES_PER_RULE = 12;

function applyRule(
  prompt: string,
  rule: Rule,
  ctx: TruthContext,
  corrections: PromptCorrection[]
): string {
  const re = new RegExp(
    rule.pattern.source,
    rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`
  );
  let text = prompt;
  let searchFrom = 0;
  for (let i = 0; i < MAX_REWRITES_PER_RULE; i += 1) {
    re.lastIndex = searchFrom;
    const match = re.exec(text);
    if (!match || match[0].length === 0) break;
    if (!rule.contradicts(ctx, match)) {
      searchFrom = match.index + match[0].length;
      continue;
    }
    const replacement = safeRewrite(rule.rewrite(ctx, match));
    corrections.push({
      claim: match[0],
      replacement,
      reason: rule.reason(ctx, match),
    });
    if (replacement === null) {
      const removed = removeSpan(text, match.index, match.index + match[0].length);
      text = removed.text;
      searchFrom = removed.index;
    } else {
      text =
        text.slice(0, match.index) +
        replacement +
        text.slice(match.index + match[0].length);
      searchFrom = match.index + replacement.length;
    }
  }
  return text;
}

/**
 * Rewrite the claims in `prompt` that contradict what we know about the
 * product, and report every rewrite.
 *
 * Guarantees:
 *   - pure: no I/O, no mutation of the input;
 *   - never returns a prompt containing a negation it introduced (G5);
 *   - returns the prompt byte-identical with `corrections: []` when there is
 *     nothing to check it against (no truth row, no facts) or nothing to
 *     correct. Callers can compare by identity to detect "unchanged".
 */
export function validateAndCorrectPrompt(
  input: ValidateAndCorrectPromptInput
): ValidatedPrompt {
  const prompt = typeof input?.prompt === "string" ? input.prompt : "";
  if (!prompt.trim()) return { prompt, corrections: [] };

  const truth =
    input.truth ?? (input.sku ? getProductTruthBySku(input.sku) ?? null : null);
  const facts = input.facts ?? null;

  // Nothing to validate against. Guessing here would recreate the very bug this
  // module exists to fix, so the prompt passes through untouched.
  if (!truth && !facts) return { prompt, corrections: [] };

  const ctx: TruthContext = {
    truth,
    facts,
    productName:
      truth?.displayName?.trim() ||
      facts?.productType?.trim() ||
      "This product",
  };

  const corrections: PromptCorrection[] = [];
  let text = prompt;
  for (const rule of RULES) {
    text = applyRule(text, rule, ctx, corrections);
  }

  return {
    prompt: corrections.length === 0 ? prompt : text,
    corrections,
  };
}
