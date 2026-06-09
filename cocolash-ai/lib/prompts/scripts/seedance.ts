import type { CampaignType, ScriptTone } from "@/lib/types";
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
      "Visual hook: immediately name or show the product detail that makes viewers lean in",
      "Product reveal: packaging, lash texture, band flexibility, or close-up quality moment",
      "Proof beat: why the feature matters in real life",
      "Benefit stack: comfort, reuse, beauty result, confidence",
      "CTA: invite the viewer to try or shop CocoLash naturally",
    ],
    motionBeats: [
      "holding the lash tray near face",
      "tilting packaging toward camera",
      "touching or pointing to the cotton band",
      "brief smile after product reveal",
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
      "pointing to product or packaging",
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
  unboxing: {
    label: "Unboxing",
    intent:
      "Make the packaging and first-touch experience feel tactile, premium, and satisfying.",
    structure: [
      "Anticipation: package just arrived",
      "Reveal: open the box and show the lashes resting inside",
      "Tactile detail: fibers, softness, band, tray, packaging",
      "First reaction: surprise or delight",
      "Try-on or shop CTA",
    ],
    motionBeats: [
      "opening or presenting packaging",
      "lifting lash tray",
      "bringing product close to camera",
      "eyes widening or smiling during reveal",
    ],
    avoid: ["listing features without reaction", "too much narration before the reveal", "fast hand movements"],
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
 * Size the spoken script to the actual Seedance clip duration (4–15s).
 * Spoken pace is ~2.5–3 words/sec, so we give the model a concrete word band
 * plus structure guidance scaled to the available time. Seedance caps at 15s,
 * so there is no 30/60/90s case — the script must fit the clip exactly.
 */
export function buildSeedanceDurationRule(seconds: number): string {
  const s = Math.max(4, Math.min(15, Math.round(seconds)));
  const minWords = Math.round(s * 2.3);
  const maxWords = Math.round(s * 3);

  let structure: string;
  if (s <= 6) {
    structure =
      "One single idea only. The first sentence must work as the visual hook. No separate CTA — fold the ask into the close.";
  } else if (s <= 10) {
    structure = "Hook + one proof/benefit beat + a short CTA.";
  } else {
    structure =
      "Hook + two quick beats + CTA. Short, speakable sentences only.";
  }

  return `${s} seconds: ${minWords}-${maxWords} words (spoken pace ~2.5-3 words/sec). ${structure}`;
}

export function buildSeedanceScriptSystemPrompt(): string {
  return `You are a UGC script writer for CocoLash videos generated with Seedance 2.0.

Your job is to write SPOKEN DIALOGUE first. Another AI layer will turn the selected script into a Seedance director prompt with camera, action, timing, and reference instructions.

Write scripts that a human-looking creator can say naturally while holding, showing, unboxing, applying, or reacting to CocoLash lashes.

Core rules:
- Write for speech, not captions. Use contractions and short sentences.
- Every script must contain a visual action opportunity: hold product, show packaging, point to lashes, turn face, reveal result, or react.
- Keep the dialogue realistic for AI lip movement. Avoid tongue-twisters, dense clauses, and rapid lists.
- Match the campaign framework exactly.
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
    `PRODUCT: ${params.productName ?? "CocoLash premium false lashes"}`,
    "",
    `BRAND FACTS TO WEAVE IN NATURALLY WHEN RELEVANT:`,
    `- Premium false lashes made for Black women and diverse eye shapes`,
    `- Flexible cotton band for comfort`,
    `- Reusable 25+ wears with proper care`,
    `- Lightweight enough for all-day wear`,
    `- Premium, giftable packaging (book-style box or lash tray)`,
    `- Cruelty-free and vegan`,
    "",
    `CAMPAIGN FOCUS AREAS:`,
    ...template.focusAreas.slice(0, 6).map((item) => `- ${item}`),
  ];

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
    `Output exactly 3 JSON scripts. The full_script should be clean spoken dialogue only.`
  );

  return lines.join("\n");
}
