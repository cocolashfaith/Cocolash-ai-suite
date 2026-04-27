/**
 * Brand Content Video Script — User Prompt Builder
 *
 * Constructs the user-facing prompt with campaign type, tone,
 * duration, product details, and campaign-specific guidance.
 *
 * Duration options for HeyGen Brand Content Studio:
 *   30s, 60s, 90s (15s still supported for Seedance/legacy)
 */

import type { CampaignType, ScriptTone, VideoDuration } from "@/lib/types";
import { CAMPAIGN_TEMPLATES } from "./templates";

export interface ScriptUserPromptParams {
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: VideoDuration;
  pipeline?: "heygen" | "seedance";
  productName?: string;
  keyFeatures?: string[];
  targetAudience?: string;
  specialOffer?: string;
  campaignFocus?: string;
  customInstructions?: string;
  autoConcept?: string;
  noveltySeed?: string;
  recentScriptSummaries?: string[];
}

const DURATION_INSTRUCTIONS: Record<VideoDuration, string> = {
  15: `DURATION: 15 seconds (~35-40 words)
This is a SHORT-FORM script. Structure:
- Hook (first 3 seconds — MUST stop the scroll)
- One key benefit or statement (5 seconds)
- CTA (final 3-5 seconds)
NO room for multiple teaching points. Get to the point FAST.`,

  30: `DURATION: 30 seconds (~65-70 words)
This is a concise educational script. Structure:
- Intro (0-5 seconds) — set the topic warmly and clearly
- One or two key teaching points (5-22 seconds) — be specific and actionable
- Takeaway + CTA (22-30 seconds) — summarise and close naturally
Tight pacing. Every sentence should teach or connect. No filler.`,

  60: `DURATION: 60 seconds (~130-140 words)
This is a standard educational script with room for depth. Full structure:
- Intro (0-7 seconds) — set the topic, establish credibility
- Key Points (7-45 seconds) — 2-3 distinct teaching moments, each with a clear takeaway
- Summary + CTA (45-60 seconds) — wrap up what the viewer learned, gentle call to action
You have enough time for real teaching. Use examples, comparisons, and sensory details.`,

  90: `DURATION: 90 seconds (~195-210 words)
This is a longer-form educational script for in-depth tutorials and storytelling. Full structure:
- Intro (0-8 seconds) — set the topic, establish why it matters
- Key Points (8-65 seconds) — 3-4 distinct teaching moments, each building on the last
- Demo/Story (65-80 seconds) — walk through a practical example, share a personal anecdote, or describe a step-by-step process
- Summary + CTA (80-90 seconds) — summarise the key takeaways, close with a warm call to action
You have real space to teach. Paint a picture. Let the viewer absorb each point before moving on.`,
};

const TONE_ADJECTIVES: Record<ScriptTone, string> = {
  casual: "warm, approachable, relatable teacher — like a friend who happens to be an expert",
  energetic: "passionate, animated, enthusiastic expert — genuinely excited about the topic",
  calm: "soft-spoken, luxurious, ASMR-adjacent beauty guru — deliberate and soothing",
  professional: "polished, credible, editorial-quality brand ambassador — authoritative but warm",
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
    campaignFocus,
    customInstructions,
    autoConcept,
    noveltySeed,
    recentScriptSummaries,
  } = params;

  const template = CAMPAIGN_TEMPLATES[campaignType];
  const durationInstructions = DURATION_INSTRUCTIONS[duration];
  const toneDesc = TONE_ADJECTIVES[tone];

  const lines: string[] = [
    `Generate 3 educational / brand content video scripts for CocoLash.`,
    "",
    `CAMPAIGN TYPE: ${template.label}`,
    template.description,
    "",
    `FOCUS AREAS:`,
    ...template.focusAreas.map((f) => `- ${f}`),
    "",
    `EXAMPLE OPENINGS (for inspiration — do NOT copy these exactly):`,
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
      `- Premium quality false lashes with hand-crafted fibers`,
      `- Flexible cotton band — lightweight, comfortable all-day wear`,
      `- Easy application — takes under 5 minutes even for beginners`,
      `- Reusable 25+ times with proper care`,
      `- Luxury magnetic-closure packaging`,
      `- Designed specifically for Black women — celebrates melanin beauty and diverse eye shapes`
    );
  }

  if (targetAudience) {
    lines.push("", `TARGET AUDIENCE: ${targetAudience}`);
  } else {
    lines.push(
      "",
      `TARGET AUDIENCE: Beauty enthusiasts who want to learn about lash care, application, and CocoLash products — confident Black women aged 20-45 who value self-care and looking their best`
    );
  }

  if (specialOffer) {
    lines.push("", `SPECIAL OFFER: ${specialOffer}`);
    lines.push(
      `If relevant, mention this offer naturally at the end — but don't make the script about the offer. The primary purpose is educational.`
    );
  }

  if (campaignFocus) {
    lines.push(
      "",
      `CREATOR'S FOCUS: The creator specifically wants this script to focus on:`,
      campaignFocus,
      `Make this the central theme. All 3 variations should address this focus from different angles.`
    );
  } else if (autoConcept) {
    lines.push(
      "",
      `SUGGESTED ANGLE: ${autoConcept}`,
      `Use this as the primary creative direction for all 3 variations — each should explore this angle from a different perspective.`
    );
  }

  if (noveltySeed) {
    lines.push(
      "",
      `CREATIVITY SEED: ${noveltySeed}`,
      `Use this seed to inspire fresh, unexpected angles. Do NOT produce generic or predictable scripts.`
    );
  }

  if (recentScriptSummaries && recentScriptSummaries.length > 0) {
    lines.push(
      "",
      `IMPORTANT — AVOID REPEATING THESE RECENT CONCEPTS:`,
      ...recentScriptSummaries.map((s) => `- "${s}"`),
      `Your scripts must take a COMPLETELY DIFFERENT angle from the concepts listed above. Do not reuse the same themes, questions, myths, or stories.`
    );
  }

  if (customInstructions) {
    lines.push(
      "",
      `ADDITIONAL INSTRUCTIONS FROM THE CREATOR:`,
      customInstructions,
      `Keep these notes in mind when writing the scripts.`
    );
  }

  lines.push(
    "",
    `Return exactly 3 unique script variations as JSON. Each script must take a completely different creative angle and teach the topic from a different perspective.`
  );

  return lines.join("\n");
}
