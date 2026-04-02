/**
 * UGC Video Script — User Prompt Builder
 *
 * Constructs the user-facing prompt with campaign type, tone,
 * duration, product details, and campaign-specific guidance.
 */

import type { CampaignType, ScriptTone, VideoDuration } from "@/lib/types";
import { CAMPAIGN_TEMPLATES } from "./templates";

export interface ScriptUserPromptParams {
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: VideoDuration;
  productName?: string;
  keyFeatures?: string[];
  targetAudience?: string;
  specialOffer?: string;
}

const DURATION_INSTRUCTIONS: Record<VideoDuration, string> = {
  15: `DURATION: 15 seconds (~35-40 words)
This is a SHORT-FORM script. Structure:
- Hook (first 3 seconds — MUST stop the scroll)
- One key benefit or statement (5 seconds)
- CTA (final 3-5 seconds)
NO room for problem/solution flow. Get to the point FAST. Every word counts.`,

  30: `DURATION: 30 seconds (~70-80 words)
This is a STANDARD short-form script. Full UGC structure:
- Hook (0-3 seconds)
- Problem or relatable moment (3-8 seconds)
- Solution — introduce CocoLash (8-20 seconds)
- CTA (20-30 seconds)
Tight pacing. No filler. Every sentence earns its place.`,

  60: `DURATION: 60 seconds (~140-160 words)
This is a LONGER-FORM script with room to breathe. Full structure with expanded proof:
- Hook (0-5 seconds)
- Problem/Relate (5-15 seconds) — go deeper into the pain point
- Solution (15-35 seconds) — describe the product experience, multiple benefits
- Proof (35-50 seconds) — personal result, before/after reference, or social proof
- CTA (50-60 seconds) — compelling, specific reason to act now
You have time for storytelling. Use it. Paint a picture.`,
};

const TONE_ADJECTIVES: Record<ScriptTone, string> = {
  casual: "relaxed, fun, bestie-energy",
  energetic: "hype, excited, fast-paced, high-energy",
  calm: "soft, luxurious, ASMR-adjacent, self-care vibes",
  professional: "polished, authoritative, beauty-expert credibility",
};

export function buildScriptUserPrompt(params: ScriptUserPromptParams): string {
  const {
    campaignType,
    tone,
    duration,
    productName,
    keyFeatures,
    targetAudience,
    specialOffer,
  } = params;

  const template = CAMPAIGN_TEMPLATES[campaignType];
  const durationInstructions = DURATION_INSTRUCTIONS[duration];
  const toneDesc = TONE_ADJECTIVES[tone];

  const lines: string[] = [
    `Generate 3 UGC video scripts for CocoLash.`,
    "",
    `CAMPAIGN TYPE: ${template.label}`,
    template.description,
    "",
    `FOCUS AREAS:`,
    ...template.focusAreas.map((f) => `- ${f}`),
    "",
    `EXAMPLE HOOKS (for inspiration — do NOT copy these exactly):`,
    ...template.exampleHooks.map((h) => `- "${h}"`),
    "",
    `TONE: ${tone} (${toneDesc})`,
    "",
    durationInstructions,
  ];

  if (productName) {
    lines.push("", `PRODUCT NAME: ${productName}`);
  } else {
    lines.push("", `PRODUCT: CocoLash premium false lashes`);
  }

  if (keyFeatures && keyFeatures.length > 0) {
    lines.push(
      "",
      `KEY FEATURES TO HIGHLIGHT:`,
      ...keyFeatures.map((f) => `- ${f}`)
    );
  } else {
    lines.push(
      "",
      `KEY FEATURES:`,
      `- Premium quality false lashes`,
      `- Lightweight, comfortable all-day wear`,
      `- Easy application — takes under 5 minutes`,
      `- Luxury packaging`,
      `- Designed for Black women — celebrates melanin beauty`
    );
  }

  if (targetAudience) {
    lines.push("", `TARGET AUDIENCE: ${targetAudience}`);
  } else {
    lines.push(
      "",
      `TARGET AUDIENCE: Confident Black women aged 20-45 who love beauty, self-care, and looking their best`
    );
  }

  if (specialOffer) {
    lines.push("", `SPECIAL OFFER: ${specialOffer}`);
    lines.push(
      `Weave this offer naturally into the script — it should feel like sharing a hot tip, not reading an ad.`
    );
  }

  lines.push(
    "",
    `Return exactly 3 unique script variations as JSON. Each script must take a completely different creative angle.`
  );

  return lines.join("\n");
}
