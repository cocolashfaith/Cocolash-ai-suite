/**
 * POST /api/seedance/last-frame
 *
 * Runs the NanoBanana Last-Frame Director chain for the first+last-frame
 * Seedance mode. Two operations:
 *
 *   action: "write-prompt" — runs Claude Opus 4.7 to convert (first-frame
 *     image + user destination description) into a Gemini image-prompt with
 *     environmental-consistency guardrails. Returns the prompt for review.
 *
 *   action: "generate" — runs the full chain (write prompt + generate image)
 *     in one call. Returns the final last-frame URL.
 *
 * The two-step flow lets the user review / edit the image prompt before
 * paying for the Gemini generation. The one-shot flow is convenience for
 * quick iteration once the prompt is solid.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  writeNanoBananaPrompt,
  generateLastFrameImage,
  generateLastFrame,
  NanoBananaDirectorError,
} from "@/lib/ai/director/nanobanana-director";
import type { AspectRatio, CampaignType } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

const VALID_ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:5", "9:16", "16:9"];

const VALID_CAMPAIGN_TYPES: CampaignType[] = [
  "product-showcase",
  "testimonial",
  "promo",
  "educational",
  "unboxing",
  "before-after",
  "brand-story",
  "faq",
  "myths",
  "product-knowledge",
];

const WritePromptSchema = z.object({
  action: z.literal("write-prompt"),
  firstFrameImageUrl: z.string().url(),
  destinationDescription: z.string().min(1),
  campaignType: z.enum(VALID_CAMPAIGN_TYPES as [CampaignType, ...CampaignType[]]),
  aspectRatio: z.string().min(1),
});

const GenerateImageSchema = z.object({
  action: z.literal("generate-image"),
  imagePrompt: z.string().min(1),
  firstFrameImageUrl: z.string().url(),
  aspectRatio: z.enum(VALID_ASPECT_RATIOS as [AspectRatio, ...AspectRatio[]]),
});

const OneShotSchema = z.object({
  action: z.literal("generate"),
  firstFrameImageUrl: z.string().url(),
  destinationDescription: z.string().min(1),
  campaignType: z.enum(VALID_CAMPAIGN_TYPES as [CampaignType, ...CampaignType[]]),
  aspectRatio: z.enum(VALID_ASPECT_RATIOS as [AspectRatio, ...AspectRatio[]]),
});

const BodySchema = z.discriminatedUnion("action", [
  WritePromptSchema,
  GenerateImageSchema,
  OneShotSchema,
]);

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = BodySchema.parse(json);
    const requestId = crypto.randomUUID();

    if (parsed.action === "write-prompt") {
      console.log(`[seedance/last-frame] ${requestId} write-prompt`);
      const result = await writeNanoBananaPrompt({
        firstFrameImageUrl: parsed.firstFrameImageUrl,
        destinationDescription: parsed.destinationDescription,
        campaignType: parsed.campaignType,
        aspectRatio: parsed.aspectRatio,
      });
      console.log(
        `[seedance/last-frame] ${requestId} write-prompt OK ${result.diagnostics.durationMs}ms`
      );
      return NextResponse.json({ success: true, requestId, ...result });
    }

    if (parsed.action === "generate-image") {
      const brandId = await resolveBrandId();
      console.log(`[seedance/last-frame] ${requestId} generate-image`);
      const result = await generateLastFrameImage(
        parsed.imagePrompt,
        parsed.firstFrameImageUrl,
        parsed.aspectRatio,
        brandId
      );
      console.log(`[seedance/last-frame] ${requestId} generate-image OK`);
      return NextResponse.json({ success: true, requestId, ...result });
    }

    // One-shot: write prompt + generate image
    const brandId = await resolveBrandId();
    console.log(`[seedance/last-frame] ${requestId} generate (one-shot)`);
    const result = await generateLastFrame(
      {
        firstFrameImageUrl: parsed.firstFrameImageUrl,
        destinationDescription: parsed.destinationDescription,
        campaignType: parsed.campaignType,
        aspectRatio: parsed.aspectRatio,
      },
      brandId,
      parsed.aspectRatio
    );
    console.log(
      `[seedance/last-frame] ${requestId} generate OK ${result.diagnostics.durationMs}ms`
    );
    return NextResponse.json({ success: true, requestId, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof NanoBananaDirectorError) {
      const status = error.code === "INVALID_INPUT" ? 400 : 500;
      console.error(`[seedance/last-frame] ${error.code}: ${error.message}`);
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[seedance/last-frame] ERR ${message}`);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Use the authenticated user's id as the brandId, matching the existing pattern. */
async function resolveBrandId(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? "anonymous";
  } catch {
    return "anonymous";
  }
}
