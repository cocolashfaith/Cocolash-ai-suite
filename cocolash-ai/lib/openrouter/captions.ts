import { getOpenRouterClient, openrouterRequest } from "./client";
import { buildCaptionSystemPrompt } from "@/lib/prompts/captions/system";
import {
  buildCaptionUserPrompt,
  type CaptionUserPromptParams,
} from "@/lib/prompts/captions/user";
import type { CaptionVariation, Platform } from "@/lib/types";
import { PLATFORM_LIMITS } from "@/lib/constants/posting-times";

const MODEL = "anthropic/claude-3.5-sonnet";

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
