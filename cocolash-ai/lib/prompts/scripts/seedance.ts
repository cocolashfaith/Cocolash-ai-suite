import type { CampaignType, ScriptTone } from "@/lib/types";
import { AUTO_DURATION, SEEDANCE_25_LIMITS } from "@/lib/seedance/v25/types";
import { AUTO_DURATION_ESTIMATE_SECONDS } from "@/lib/seedance/pricing";
import type { ScriptUserPromptParams } from "./user";
import { CAMPAIGN_TEMPLATES } from "./templates";

interface SeedanceScriptFramework {
  label: string;
  intent: string;
  structure: string[];
  motionBeats: string[];
  avoid: string[];
}

const FRAMEWORKS: Partial<Record<CampaignType, SeedanceScriptFramework>> = {
  "product-showcase": {
    label: "Product Showcase",
    intent:
      "Make the product visually irresistible while keeping the creator's delivery natural and UGC-native.",
    structure: [
      "Visual hook: a first line that makes viewers lean in",
      "Product reveal: the moment it comes into frame — react to it, do not describe it",
      "Proof beat: why it matters in real life",
      "Benefit stack: comfort, reuse, beauty result, confidence",
      "CTA: invite the viewer to try or shop CocoLash naturally",
    ],
    motionBeats: [
      "holding the product up near her face",
      "tilting the product toward the camera",
      "pointing toward her lashes",
      "brief smile after the reveal",
    ],
    avoid: ["generic luxury claims", "too many features at once", "static product description"],
  },
  testimonial: {
    label: "Testimonial",
    intent:
      "Sound like a real customer telling a believable story, not an ad read.",
    structure: [
      "Personal problem or skepticism",
      "Discovery moment with CocoLash",
      "Real usage proof: wear time, comfort, application, reaction",
      "Emotional result: confidence, feeling put together, compliments",
      "Recommendation CTA",
    ],
    motionBeats: [
      "selfie-style eye contact",
      "subtle nods and expressive eyebrows",
      "holding product casually, not like a commercial model",
      "small before/after face angle movement",
    ],
    avoid: ["over-polished sales language", "fake testimonial clichés", "unsupported claims"],
  },
  promo: {
    label: "Sale / Promo",
    intent:
      "Create urgency and value while still feeling like a creator sharing a useful find.",
    structure: [
      "Urgent opening tied to the offer or drop",
      "Value explanation: what they get and why it is worth it",
      "Product proof: why CocoLash is not just another lash",
      "Now-or-never reason without sounding pushy",
      "Clear CTA",
    ],
    motionBeats: [
      "energetic direct-to-camera delivery",
      "quick product lift toward lens",
      "pointing to the product",
      "smiling confident close",
    ],
    avoid: ["fake scarcity", "shouting", "discount-only script with no product proof"],
  },
  educational: {
    label: "Educational",
    intent:
      "Teach one useful lash lesson that the viewer can apply immediately.",
    structure: [
      "Common mistake, question, or desired outcome",
      "Step 1: simple action",
      "Step 2: correction or technique",
      "Expert tip connected to CocoLash",
      "Takeaway CTA",
    ],
    motionBeats: [
      "pointing to lash placement area",
      "holding product as demonstration reference",
      "slow deliberate hand movement",
      "calm confident close-up framing",
    ],
    avoid: ["too many tips for the duration", "teacherly lectures", "instructions that require complex hand choreography"],
  },
  // G1 (2026-09-10): this framework used to order the writer to narrate
  // "Tactile detail: fibers, softness, band, tray, packaging" while it could
  // not see the product — so it invented the detail. An unboxing script is
  // carried by anticipation, reaction and result; the images decide what the
  // thing actually looks like.
  unboxing: {
    label: "Unboxing",
    intent:
      "Carry the excitement of the arrival through anticipation and honest reaction — never through invented product detail.",
    structure: [
      "Anticipation: it finally arrived and she has been waiting for it",
      "Reveal moment: it is open and in her hands — react, do not describe it",
      "Honest first reaction: surprise, relief, 'okay, these are actually good'",
      "Result she is expecting: how they are going to look and feel on",
      "Try-on or shop CTA",
    ],
    motionBeats: [
      "reacting to what she has just opened",
      "lifting the product toward the camera",
      "bringing the product close for a better look",
      "eyes widening or smiling during the reveal",
    ],
    avoid: [
      "describing what the product or its packaging looks like — the visual layer owns that",
      "listing features without reaction",
      "too much narration before the reveal",
      "fast hand movements",
    ],
  },
  "before-after": {
    label: "Before & After",
    intent:
      "Make the transformation clear, visual, and confidence-led.",
    structure: [
      "Before state: bare lashes or low-confidence moment",
      "Application/action beat",
      "Reveal: what changed visually",
      "Feeling/result: confidence, polish, main-character energy",
      "CTA tied to getting the same result",
    ],
    motionBeats: [
      "starting with natural face angle",
      "turning face slightly to show lashes",
      "holding product after reveal",
      "confident smile or small hair tuck",
    ],
    avoid: ["unrealistic transformation claims", "complex cut instructions inside spoken script", "negative self-talk"],
  },
};

const TONE_NOTES: Record<ScriptTone, string> = {
  casual: "relatable, quick, friendly, creator-to-friend language",
  energetic: "animated, high-conviction, excited but still believable",
  calm: "soft, confident, beauty-routine pace with gentle pauses",
  professional: "polished creator voice, credible but still natural on TikTok/Reels",
};

/**
 * Size the spoken script to the actual Seedance clip duration.
 *
 * Seedance 2.5 clips run 4-30 seconds, or "Auto" (`-1`) where the model picks
 * the final length. Seedance 2.0 clips run 4-15 seconds — the same clamp
 * covers both because 2.0 durations are always inside the 2.5 range.
 *
 * Spoken pace is ~2.3-3 words/sec, so we give the model a concrete word band
 * plus structure guidance scaled to the available time. There is no 60/90s
 * case — the script must fit the clip exactly.
 *
 * Auto (`-1`, or any non-finite value) is planned as ~10 seconds and the rule
 * says so explicitly, so the writer knows the length is a target, not a cap.
 */
export function buildSeedanceDurationRule(seconds: number): string {
  const isAuto = !Number.isFinite(seconds) || Math.round(seconds) <= AUTO_DURATION;
  const s = isAuto
    ? AUTO_DURATION_ESTIMATE_SECONDS
    : Math.max(
        SEEDANCE_25_LIMITS.durationMin,
        Math.min(SEEDANCE_25_LIMITS.durationMax, Math.round(seconds))
      );
  const minWords = Math.round(s * 2.3);
  const maxWords = Math.round(s * 3);

  let structure: string;
  if (s <= 6) {
    structure =
      "One single idea only. The first sentence must work as the visual hook. No separate CTA — fold the ask into the close.";
  } else if (s <= 10) {
    structure =
      "Hook + one proof/benefit beat + a short CTA. Do NOT cover every framework beat — pick the strongest one or two.";
  } else if (s <= 15) {
    structure = "Hook + two quick beats + CTA. Short, speakable sentences only.";
  } else {
    structure =
      "Hook + two or three beats + CTA; still short speakable sentences; no filler. Give each beat one clear idea and move on — a long clip is not permission to ramble.";
  }

  const lead = isAuto
    ? `Duration is Auto — write for about ${s} seconds.`
    : `HARD LENGTH LIMIT — the clip is only ${s} seconds long.`;
  const overrun = isAuto
    ? "Going far over the band makes the delivery rushed."
    : "A longer script gets cut off mid-sentence in the video.";

  return `${lead} The full_script MUST be ${minWords}-${maxWords} words and MUST NOT exceed ${maxWords} words (spoken pace ~2.5-3 words/sec). ${overrun} Count the words before you finish. ${structure}`;
}

/**
 * Decision G1 (2026-09-10) — the single most important rule in this prompt.
 *
 * The script writer is a TEXT model. It never sees the product. When it was
 * asked for "tactile detail" it duly invented some, and a CocoLash kit that has
 * no glass anywhere on it was described as having "a glass cover" — a claim
 * that then flowed verbatim into the video prompt. Appearance is the visual
 * prompt's job: that layer is shown the real product photographs.
 */
export const SCRIPT_NO_PHYSICAL_DESCRIPTION_RULE = `PRODUCT HONESTY — THIS RULE OUTRANKS EVERY OTHER RULE HERE:
- You cannot see the product. You are writing what the creator SAYS, nothing else. Never describe what the product looks like.
- NEVER describe, name or imply: packaging, boxes, cases, trays, sleeves, inserts; lids and covers; closures — how it opens, shuts, snaps, folds or seals; materials (glass, plastic, acrylic, leather, velvet, metal, wood, silk, cotton); transparency (clear, see-through, frosted, tinted); mirrors or any reflective surface; colours, finishes or lettering; and any physical construction, shape, size, weight or piece-count.
- BANNED PHRASING — these are examples of the failure, not the whole list: "glass cover", "clear lid", "mirrored inside", "velvet-lined tray", "matte black box", "rose-gold lettering", "it flips open", "it snaps shut", "comes in the cutest little case".
- YOU MAY: name the product, and talk about how it feels to wear, the result it gives, comfort, wear time, confidence, the hook and the CTA.
- If a beat seems to need a physical detail, use a reaction or a benefit instead. Say "wait until you see these on" — never "look at this box".
- Every appearance detail you invent becomes a false claim in the finished video. When you are unsure whether something is a physical description, it is: leave it out.`;

export function buildSeedanceScriptSystemPrompt(): string {
  return `You are a UGC script writer for CocoLash videos generated with Seedance 2.0 / 2.5.

Your job is to write SPOKEN DIALOGUE first. Another AI layer will turn the selected script into a Seedance director prompt with camera, action, timing, and reference instructions.

Write scripts that a human-looking creator can say naturally while holding, showing, unboxing, applying, or reacting to CocoLash lashes.

${SCRIPT_NO_PHYSICAL_DESCRIPTION_RULE}

Core rules:
- LENGTH IS A HARD CONSTRAINT. The clip is short (4-30 seconds) — obey the word limit in the user message exactly. Every full_script MUST fit the limit; count the words. A script that runs long gets cut off mid-sentence in the video. When in doubt, write fewer words.
- Write for speech, not captions. Use contractions and short sentences.
- Every script must leave room for a visual action: hold the product, lift it toward the lens, point to the lashes, turn the face, reveal the result, or react. Leave room for the action — never narrate what the action shows.
- Keep the dialogue realistic for AI lip movement. Avoid tongue-twisters, dense clauses, and rapid lists.
- Follow the campaign framework's INTENT, but the length limit always wins — compress or drop framework beats to fit the clip. Do not try to cover every beat in a short clip.
- Mention CocoLash naturally at least once.
- Do not write camera directions, shot labels, hashtags, emojis, markdown, or stage directions inside full_script.
- Do not use bracketed actions like [holds product]. The next layer handles action direction.

Return valid JSON only:
{
  "scripts": [
    {
      "hook": "opening spoken line",
      "body": "middle spoken section",
      "cta": "closing spoken CTA",
      "full_script": "hook + body + cta as one natural spoken script",
      "estimated_duration": 15,
      "style_match": 0.95
    }
  ]
}

Generate exactly 3 variations. Each variation must use a different angle and different opening.`;
}

/** Used only when the caller could not tell us the real product name. */
const GENERIC_PRODUCT_PLACEHOLDER = "CocoLash lashes";

/**
 * G1 — the shared `CAMPAIGN_TEMPLATES` focus areas are written for the HeyGen
 * pipeline, where a human picks the b-roll. Several of them order the writer to
 * narrate physical detail it cannot see ("the weight of the box, the packaging,
 * the presentation"; "hand-crafted fibers"; "the premium packaging"). Those are
 * the same instruction class that produced "glass cover", so they are dropped
 * from the Seedance script prompt. The templates file is shared, so the filter
 * lives here rather than in the source data.
 */
const PHYSICAL_FOCUS_AREA = new RegExp(
  [
    "packaging",
    "\\bbox\\b",
    "\\bband\\b",
    "\\bbands\\b",
    "fiber",
    "fibre",
    "\\btray\\b",
    "\\bcase\\b",
    "\\blid\\b",
    "cover",
    "material",
    "texture",
    "unboxing",
    "close-ups",
    "construction",
    "hand-crafted",
    "softness",
    "curl pattern",
    "presentation",
  ].join("|"),
  "i"
);

function selectFocusAreas(focusAreas: string[]): string[] {
  const kept = focusAreas.filter((area) => !PHYSICAL_FOCUS_AREA.test(area));
  return kept.slice(0, 6);
}

export function buildSeedanceScriptUserPrompt(
  params: ScriptUserPromptParams
): string {
  const template = CAMPAIGN_TEMPLATES[params.campaignType];
  const framework = FRAMEWORKS[params.campaignType] ?? FRAMEWORKS.educational!;

  const lines: string[] = [
    `Generate 3 Seedance-ready UGC spoken scripts for CocoLash.`,
    "",
    `CAMPAIGN TYPE: ${framework.label}`,
    `CAMPAIGN INTENT: ${framework.intent}`,
    "",
    `SCRIPT FRAMEWORK:`,
    ...framework.structure.map((item, index) => `${index + 1}. ${item}`),
    "",
    `VISUAL ACTION OPPORTUNITIES THE SCRIPT SHOULD SUPPORT:`,
    ...framework.motionBeats.map((item) => `- ${item}`),
    "",
    `AVOID:`,
    ...framework.avoid.map((item) => `- ${item}`),
    "",
    `TONE: ${params.tone} (${TONE_NOTES[params.tone]})`,
    buildSeedanceDurationRule(params.duration),
    "",
  ];

  // G1: the real product name when we know it, instead of the old blind
  // placeholder "CocoLash premium false lashes".
  const productName = params.productName?.trim();
  lines.push(`PRODUCT: ${productName || GENERIC_PRODUCT_PLACEHOLDER}`);
  if (productName) {
    lines.push(
      `Call the product by that name. Do not invent a different name, a variant, or any description of how it looks.`
    );
  }
  lines.push("");

  if (params.productFacts) {
    // G3 truth precedence: when the product's own images have been analysed,
    // those facts are the ONLY product truth in play — the generic brand
    // claims below are dropped entirely so they cannot contradict them.
    lines.push(
      params.productFacts,
      "",
      `HOW TO USE THOSE FACTS: they exist so that you never have to guess. They are reference, NOT a script — do not read them out and do not turn them into spoken description. Ignore any other CocoLash brand copy you may have seen; where anything conflicts with these facts, these facts win. Anything not listed there does not exist.`,
      ""
    );
  } else {
    // G3 fallback: no images were analysed, so all we have is generic brand
    // copy. It is the weakest layer of truth — never physical description.
    lines.push(
      `GENERIC BRAND FACTS (fallback only — no product images were analysed for this script. Weave in at most one or two, and never as a description of how the product looks. If any of these ever conflicts with analysed product facts, the analysed facts win):`,
      `- Premium false lashes made for Black women and diverse eye shapes`,
      `- Flexible cotton band for comfort`,
      `- Reusable 25+ wears with proper care`,
      `- Lightweight enough for all-day wear`,
      `- Cruelty-free and vegan`,
      ""
    );
  }

  const focusAreas = selectFocusAreas(template.focusAreas);
  if (focusAreas.length > 0) {
    lines.push(
      `CAMPAIGN FOCUS AREAS:`,
      ...focusAreas.map((item) => `- ${item}`)
    );
  }

  if (params.autoConcept) {
    lines.push("", `SUGGESTED ANGLE: ${params.autoConcept}`);
  }

  if (params.campaignFocus) {
    lines.push("", `CREATOR'S FOCUS: ${params.campaignFocus}`);
  }

  if (params.specialOffer) {
    lines.push("", `SPECIAL OFFER: ${params.specialOffer}`);
  }

  if (params.customInstructions) {
    lines.push("", `CREATOR NOTES: ${params.customInstructions}`);
  }

  if (params.recentScriptSummaries && params.recentScriptSummaries.length > 0) {
    lines.push(
      "",
      `DO NOT REPEAT THESE RECENT HOOKS/CONCEPTS:`,
      ...params.recentScriptSummaries.map((item) => `- "${item}"`)
    );
  }

  lines.push(
    "",
    `Output exactly 3 JSON scripts. The full_script should be clean spoken dialogue only.`,
    `Before you finish, re-read each full_script and delete any phrase that describes what the product looks like — packaging, materials, lids, closures, transparency, mirrors, colours or construction. That rule outranks every framework beat above.`
  );

  return lines.join("\n");
}
