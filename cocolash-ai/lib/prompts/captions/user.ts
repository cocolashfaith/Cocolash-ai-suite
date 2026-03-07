import type { CaptionStyle, Platform, ImageContext } from "@/lib/types";
import { PLATFORM_LIMITS } from "@/lib/constants/posting-times";

const STYLE_DESCRIPTIONS: Record<CaptionStyle, string> = {
  casual:
    "Write like you're texting a friend who just asked 'what lashes are those?!' — short, fun, real.",
  professional:
    "Write as a luxury beauty brand — polished, confident, aspirational but approachable. Think editorial.",
  promotional:
    "Write with urgency — there's a deal, a drop, or a reason to act now. Strong CTA, punchy phrasing.",
  storytelling:
    "Paint a scene — the moment she looked in the mirror, the feeling of putting on those lashes. Draw the reader in emotionally.",
  question:
    "Lead with a question that stops the scroll — make people want to answer, comment, or save this post.",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "lash-closeup": "extreme close-up of lashes on the eye — detail, texture, precision",
  "lifestyle": "lifestyle setting — the model is living her life, lashes completing the look",
  "product": "product photography — the lash packaging, kit, or product itself is the star",
  "before-after": "before-and-after transformation — bare lash line vs. full CocoLash look",
  "application-process": "lash application in progress — tutorial/how-to moment",
};

export interface CaptionUserPromptParams {
  imageContext: ImageContext;
  style: CaptionStyle;
  platform: Platform;
  customNote?: string;
}

export function buildCaptionUserPrompt(params: CaptionUserPromptParams): string {
  const { imageContext, style, platform, customNote } = params;
  const limits = PLATFORM_LIMITS[platform];
  const categoryDesc = CATEGORY_DESCRIPTIONS[imageContext.category] || imageContext.category;

  const lines: string[] = [
    `Generate 3 ${style} captions for ${platform}.`,
    "",
    "IMAGE CONTEXT:",
    `- Category: ${imageContext.category} (${categoryDesc})`,
    `- Lash Style: ${imageContext.lashStyle}`,
    `- Vibe/Mood: ${imageContext.vibe}`,
    `- Scene: ${imageContext.scene}`,
    `- Skin Tone: ${imageContext.skinTone}`,
    `- Composition: ${imageContext.composition}`,
  ];

  if (imageContext.seasonal) {
    lines.push(`- Seasonal Theme: ${imageContext.seasonal}`);
  }

  if (imageContext.productSubCategory) {
    lines.push(`- Product Sub-Category: ${imageContext.productSubCategory}`);
  }

  lines.push(
    "",
    `PLATFORM: ${platform}`,
    `CHARACTER LIMIT: ${limits.caption} characters`,
    "",
    `STYLE: ${style}`,
    STYLE_DESCRIPTIONS[style],
  );

  if (customNote) {
    lines.push("", `ADDITIONAL CONTEXT: ${customNote}`);
  }

  lines.push(
    "",
    "Return exactly 3 unique caption variations as JSON. Do NOT include hashtags in the caption text."
  );

  return lines.join("\n");
}
