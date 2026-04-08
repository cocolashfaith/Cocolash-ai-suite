import { getOpenRouterClient, openrouterRequest } from "./client";
import { buildCaptionSystemPrompt } from "@/lib/prompts/captions/system";
import {
  buildCaptionUserPrompt,
  type CaptionUserPromptParams,
} from "@/lib/prompts/captions/user";
import { buildScriptSystemPrompt } from "@/lib/prompts/scripts/system";
import {
  buildScriptUserPrompt,
  type ScriptUserPromptParams,
} from "@/lib/prompts/scripts/user";
import type { CaptionVariation, Platform, ScriptResult } from "@/lib/types";
import { PLATFORM_LIMITS } from "@/lib/constants/posting-times";

const MODEL = "anthropic/claude-sonnet-4.6";

interface RawCaptionOutput {
  text: string;
  style_match: number;
}

interface ParsedCaptionResponse {
  captions: RawCaptionOutput[];
}

export async function generateCaptions(
  params: CaptionUserPromptParams & { brandVoice?: string | null }
): Promise<CaptionVariation[]> {
  const systemPrompt = buildCaptionSystemPrompt(params.brandVoice);
  const userPrompt = buildCaptionUserPrompt(params);

  const client = getOpenRouterClient();
  const completion = await openrouterRequest(() =>
    client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.8,
    })
  );

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenRouter returned empty response");
  }

  const parsed = parseCaptionResponse(raw);
  const limit = PLATFORM_LIMITS[params.platform].caption;

  return parsed.map((c) => ({
    text: c.text,
    style_match: c.style_match,
    hashtags: [],
    character_count: c.text.length,
    is_within_limit: c.text.length <= limit,
  }));
}

function parseCaptionResponse(raw: string): RawCaptionOutput[] {
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
    const data = JSON.parse(cleaned) as ParsedCaptionResponse;

    if (Array.isArray(data.captions) && data.captions.length >= 1) {
      return data.captions.slice(0, 3).map((c) => ({
        text: typeof c.text === "string" ? c.text : String(c.text),
        style_match:
          typeof c.style_match === "number"
            ? c.style_match
            : parseFloat(String(c.style_match)) || 0.8,
      }));
    }
  } catch {
    // Fallback: try to extract text between quotes
  }

  return fallbackParse(raw);
}

function fallbackParse(raw: string): RawCaptionOutput[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 20 &&
        !l.startsWith("{") &&
        !l.startsWith("}") &&
        !l.startsWith("[") &&
        !l.startsWith("]") &&
        !l.startsWith("```")
    );

  if (lines.length === 0) {
    return [
      {
        text: "Your lashes, your moment. CocoLash makes every look unforgettable.",
        style_match: 0.5,
      },
    ];
  }

  return lines.slice(0, 3).map((text, i) => ({
    text: text.replace(/^["'\d.\-)\s]+/, "").replace(/["']$/, ""),
    style_match: 0.7 - i * 0.05,
  }));
}

export function getAvailableModel(): string {
  return MODEL;
}

export function estimateCaptionCost(platformCount: number): number {
  const avgInputTokens = 600;
  const avgOutputTokens = 300;
  const inputCostPer1K = 0.003;
  const outputCostPer1K = 0.015;

  const costPerCall =
    (avgInputTokens / 1000) * inputCostPer1K +
    (avgOutputTokens / 1000) * outputCostPer1K;

  return Number((costPerCall * platformCount).toFixed(4));
}

// ═══════════════════════════════════════════════════════════════
// Video Script Generation
// ═══════════════════════════════════════════════════════════════

interface RawScriptOutput {
  hook: string;
  body: string;
  cta: string;
  full_script: string;
  estimated_duration: number;
  style_match: number;
}

interface ParsedScriptResponse {
  scripts: RawScriptOutput[];
}

/**
 * Generates 3 UGC video script variations using Claude via OpenRouter.
 */
export async function generateVideoScript(
  params: ScriptUserPromptParams
): Promise<ScriptResult[]> {
  const systemPrompt = buildScriptSystemPrompt();
  const userPrompt = buildScriptUserPrompt(params);

  const client = getOpenRouterClient();
  const completion = await openrouterRequest(() =>
    client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.8,
    })
  );

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenRouter returned empty response for script generation");
  }

  return parseScriptResponse(raw, params.duration);
}

function parseScriptResponse(
  raw: string,
  targetDuration: number
): ScriptResult[] {
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
    const data = JSON.parse(cleaned) as ParsedScriptResponse;

    if (Array.isArray(data.scripts) && data.scripts.length >= 1) {
      return data.scripts.slice(0, 3).map((s) => ({
        hook: String(s.hook ?? ""),
        body: String(s.body ?? ""),
        cta: String(s.cta ?? ""),
        full_script: String(s.full_script ?? `${s.hook} ${s.body} ${s.cta}`),
        estimated_duration:
          typeof s.estimated_duration === "number"
            ? s.estimated_duration
            : targetDuration,
        style_match:
          typeof s.style_match === "number"
            ? s.style_match
            : parseFloat(String(s.style_match)) || 0.85,
      }));
    }
  } catch {
    // Fallback below
  }

  return scriptFallbackParse(raw, targetDuration);
}

function scriptFallbackParse(
  raw: string,
  targetDuration: number
): ScriptResult[] {
  const paragraphs = raw
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  if (paragraphs.length === 0) {
    return [
      {
        hook: "Girl, let me put you on to something...",
        body: "These CocoLash lashes are literally the softest, most comfortable lashes I've ever worn. And the packaging? Luxury.",
        cta: "Link in bio. You're welcome.",
        full_script:
          "Girl, let me put you on to something... These CocoLash lashes are literally the softest, most comfortable lashes I've ever worn. And the packaging? Luxury. Link in bio. You're welcome.",
        estimated_duration: targetDuration,
        style_match: 0.5,
      },
    ];
  }

  return paragraphs.slice(0, 3).map((text, i) => {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    const hook = sentences[0]?.trim() ?? text.substring(0, 50);
    const cta = sentences[sentences.length - 1]?.trim() ?? "Check out CocoLash.";
    const body = sentences.slice(1, -1).join(". ").trim() || text;

    return {
      hook,
      body,
      cta,
      full_script: text,
      estimated_duration: targetDuration,
      style_match: 0.6 - i * 0.05,
    };
  });
}

export function estimateScriptCost(): number {
  const avgInputTokens = 1200;
  const avgOutputTokens = 800;
  const inputCostPer1K = 0.003;
  const outputCostPer1K = 0.015;

  return Number(
    (
      (avgInputTokens / 1000) * inputCostPer1K +
      (avgOutputTokens / 1000) * outputCostPer1K
    ).toFixed(4)
  );
}
