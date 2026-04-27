import { getOpenRouterClient, openrouterRequest } from "@/lib/openrouter/client";
import type { CampaignType } from "@/lib/types";
import type { SeedanceMode } from "./types";
import type { UGCScene, UGCVibe } from "./ugc-image-prompt";
import {
  buildSeedanceVideoPrompt,
  buildSeedanceVideoPromptWithAudio,
} from "./video-prompt";

const MODEL = "anthropic/claude-sonnet-4.6";

export interface SeedanceDirectorPromptParams {
  campaignType: CampaignType;
  scriptText: string;
  personDescription: string;
  productDescription: string;
  scene: UGCScene;
  vibe: UGCVibe;
  duration: number;
  aspectRatio: string;
  mode: SeedanceMode | "text-to-video";
  audioMode: "script-in-prompt" | "uploaded-audio";
  hasProductReference: boolean;
  hasCharacterReference: boolean;
  hasAudioReference: boolean;
  hasVideoReference: boolean;
}

const CAMPAIGN_DIRECTIVES: Partial<Record<CampaignType, string>> = {
  "product-showcase":
    "Prioritize product reveal, packaging detail, lash texture, and the creator naturally holding the product near her face.",
  testimonial:
    "Prioritize believable selfie review energy, natural facial reactions, and a personal proof moment.",
  promo:
    "Prioritize urgency, value, direct eye contact, energetic pointing or product lift, and a clear CTA.",
  educational:
    "Prioritize one teachable action, slow deliberate gestures, and clear product demonstration.",
  unboxing:
    "Prioritize tactile opening/reveal, close-up product inspection, and genuine first reaction.",
  "before-after":
    "Prioritize transformation reveal, face angle change, lash visibility, and confidence after the result.",
  faq:
    "Prioritize direct answer delivery, clear explanation, and product proof.",
  myths:
    "Prioritize myth correction, confident delivery, and calm authority.",
  "product-knowledge":
    "Prioritize detailed product inspection, material callouts, and craftsmanship proof.",
  "brand-story":
    "Prioritize warmth, personal storytelling, and brand mission.",
};

export async function generateSeedanceDirectorPrompt(
  params: SeedanceDirectorPromptParams
): Promise<string> {
  const client = getOpenRouterClient();
  const completion = await openrouterRequest(() =>
    client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: buildDirectorSystemPrompt() },
        { role: "user", content: buildDirectorUserPrompt(params) },
      ],
      max_tokens: 1200,
      temperature: 0.55,
    })
  );

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenRouter returned empty Seedance prompt response");
  }

  return parseDirectorPrompt(raw, params);
}

export function buildSeedanceDirectorPromptFallback(
  params: SeedanceDirectorPromptParams
): string {
  if (params.audioMode === "uploaded-audio") {
    return buildSeedanceVideoPromptWithAudio({
      campaignType: params.campaignType,
      personDescription: params.personDescription,
      productDescription: params.productDescription,
      scene: params.scene,
      vibe: params.vibe,
      duration: params.duration,
    });
  }

  return buildSeedanceVideoPrompt({
    campaignType: params.campaignType,
    scriptText: params.scriptText,
    personDescription: params.personDescription,
    productDescription: params.productDescription,
    scene: params.scene,
    vibe: params.vibe,
    duration: params.duration,
  });
}

function buildDirectorSystemPrompt(): string {
  return `You are a Seedance 2.0 prompt director for CocoLash UGC videos.

Your job is to transform a spoken creator script into a concise, model-ready Seedance prompt. Think like a director, not a narrator.

Follow this structure:
Subject -> Action -> Environment -> Camera -> Style -> Constraints -> Dialogue.

Rules:
- Keep the final prompt between 90 and 180 words.
- Use present-tense action verbs.
- Give one primary camera movement, not several competing moves.
- Include clear product interaction.
- Include exact spoken dialogue when provided.
- Use positive constraints: maintain face consistency, stable framing, smooth natural hand motion.
- Avoid overloading the prompt with too many details.
- If references exist, explicitly assign @Image/@Video/@Audio roles.
- Return JSON only: { "prompt": "..." }`;
}

function buildDirectorUserPrompt(params: SeedanceDirectorPromptParams): string {
  const referenceLines = buildReferenceLines(params);

  return [
    `Create the final Seedance 2.0 prompt for a CocoLash UGC video.`,
    "",
    `CAMPAIGN: ${params.campaignType}`,
    `CAMPAIGN DIRECTIVE: ${CAMPAIGN_DIRECTIVES[params.campaignType] ?? "Create natural UGC beauty content."}`,
    `MODE: ${params.mode}`,
    `DURATION: ${params.duration}s`,
    `ASPECT RATIO: ${params.aspectRatio}`,
    "",
    `CREATOR / SUBJECT: ${params.personDescription}`,
    `PRODUCT: ${params.productDescription}`,
    `SCENE: ${params.scene}`,
    `VIBE: ${params.vibe}`,
    "",
    `REFERENCE ROLES:`,
    ...referenceLines,
    "",
    `SPOKEN SCRIPT:`,
    `"${params.scriptText}"`,
    "",
    `Prompt requirements:`,
    `- Start with the subject and action, not the setting.`,
    `- Include tactile product action and facial expression.`,
    `- Include a shot/timing plan appropriate for ${params.duration}s.`,
    `- The creator says the script exactly, with natural pauses and lip movement.`,
    `- Use stable, realistic UGC phone footage style.`,
    `- Include constraints: maintain face consistency, keep product recognizable, smooth natural hands, stable framing.`,
  ].join("\n");
}

function buildReferenceLines(params: SeedanceDirectorPromptParams): string[] {
  const lines: string[] = [];
  if (params.mode === "ugc") {
    if (params.hasCharacterReference) {
      lines.push("Use the influencer reference as the creator's face and appearance; maintain identity throughout.");
    }
    if (params.hasProductReference) {
      lines.push("Use the product reference as the CocoLash item; keep packaging and lash details recognizable.");
    }
    if (params.hasAudioReference) {
      lines.push("Use the audio reference for voice or pacing when available.");
    }
    return lines.length > 0 ? lines : ["No external references; use text direction only."];
  }

  if (params.hasCharacterReference) {
    lines.push("@Image1 is the creator face/appearance reference; maintain identity throughout.");
  }
  if (params.hasProductReference) {
    lines.push("@Image2 is the CocoLash product reference; keep packaging and lash details recognizable.");
  }
  if (params.hasVideoReference) {
    lines.push("@Video1 is for motion/camera pacing only; do not replace the creator identity.");
  }
  if (params.hasAudioReference) {
    lines.push("@Audio1 is the voice/audio reference; sync lip movement and pacing to it.");
  }
  if (lines.length === 0) {
    lines.push("No external references; use text direction only.");
  }
  return lines;
}

function parseDirectorPrompt(
  raw: string,
  params: SeedanceDirectorPromptParams
): string {
  let cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  const braceStart = cleaned.indexOf("{");
  const braceEnd = cleaned.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    cleaned = cleaned.slice(braceStart, braceEnd + 1);
  }

  try {
    const parsed = JSON.parse(cleaned) as { prompt?: unknown };
    if (typeof parsed.prompt === "string" && parsed.prompt.trim().length > 0) {
      return parsed.prompt.trim();
    }
  } catch {
    // Use text fallback below.
  }

  const text = raw
    .replace(/```(?:json)?/g, "")
    .replace(/```/g, "")
    .trim();

  if (text.length > 40) {
    return text;
  }

  return buildSeedanceDirectorPromptFallback(params);
}
