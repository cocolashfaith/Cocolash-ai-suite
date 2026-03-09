import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import { generateCaptions } from "@/lib/openrouter/captions";
import { selectHashtags } from "@/lib/hashtags/selector";
import { PLATFORM_LIMITS } from "@/lib/constants/posting-times";
import type {
  CaptionStyle,
  Platform,
  GeneratedImage,
  CaptionSettings,
  ImageContext,
  CaptionPlatformResult,
} from "@/lib/types";

const VALID_STYLES: CaptionStyle[] = [
  "casual",
  "professional",
  "promotional",
  "storytelling",
  "question",
];

const VALID_PLATFORMS: Platform[] = [
  "instagram",
  "tiktok",
  "twitter",
  "facebook",
  "linkedin",
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageId, style, platforms, customNote } = body as {
      imageId?: string;
      style?: CaptionStyle;
      platforms?: Platform[];
      customNote?: string;
    };

    if (!imageId) {
      return NextResponse.json(
        { error: "imageId is required" },
        { status: 400 }
      );
    }

    if (!style || !VALID_STYLES.includes(style)) {
      return NextResponse.json(
        { error: `style must be one of: ${VALID_STYLES.join(", ")}` },
        { status: 400 }
      );
    }

    if (
      !platforms ||
      !Array.isArray(platforms) ||
      platforms.length === 0 ||
      !platforms.every((p) => VALID_PLATFORMS.includes(p))
    ) {
      return NextResponse.json(
        { error: `platforms must be a non-empty array of: ${VALID_PLATFORMS.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = await getCurrentUserId(supabase);

    let imageQuery = supabase
      .from("generated_images")
      .select("*")
      .eq("id", imageId);
    if (userId) imageQuery = imageQuery.eq("user_id", userId);

    const { data: image, error: imageError } = await imageQuery.single();

    if (imageError || !image) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    const typedImage = image as GeneratedImage;
    const imageContext = buildImageContext(typedImage);

    const { data: settingsRows } = await supabase
      .from("caption_settings")
      .select("*")
      .limit(1);

    const settings = (settingsRows?.[0] as CaptionSettings | undefined) ?? null;
    const brandVoice = settings?.brand_voice_prompt ?? null;
    const neverInclude = settings?.never_include_hashtags ?? [];

    const results: CaptionPlatformResult[] = await Promise.all(
      platforms.map(async (platform) => {
        const variations = await generateCaptions({
          imageContext,
          style,
          platform,
          customNote,
          brandVoice,
        });

        const captionsWithHashtags = await Promise.all(
          variations.map(async (v) => {
            const hashtags = await selectHashtags({
              imageContext,
              platform,
              captionText: v.text,
              neverInclude,
            });

            const hashtagString = hashtags.map((h) => `#${h}`).join(" ");
            const totalLength = v.text.length + (hashtagString.length > 0 ? 1 + hashtagString.length : 0);
            const limit = PLATFORM_LIMITS[platform].caption;

            return {
              text: v.text,
              style_match: v.style_match,
              hashtags,
              character_count: totalLength,
              is_within_limit: totalLength <= limit,
            };
          })
        );

        const inserts = captionsWithHashtags.map((c) => ({
          image_id: imageId,
          platform,
          caption_text: c.text,
          caption_style: style,
          hashtags: c.hashtags,
          character_count: c.character_count,
          is_selected: false,
        }));

        await supabase.from("captions").insert(inserts);

        return { platform, captions: captionsWithHashtags };
      })
    );

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    console.error("[captions/generate] Error:", error);
    const message =
      error instanceof Error ? error.message : "Caption generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildImageContext(image: GeneratedImage): ImageContext {
  const s = image.selections;
  return {
    category: s.category,
    lashStyle: s.lashStyle,
    vibe: s.vibe,
    scene: s.scene,
    skinTone: s.skinTone,
    seasonal: s.seasonal?.presetSlug ?? null,
    composition: s.composition,
    productSubCategory: s.productSubCategory,
  };
}
