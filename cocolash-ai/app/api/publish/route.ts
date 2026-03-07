import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBlotatoClient } from "@/lib/blotato/client";
import { BlotatoError, type BlotatoPlatform } from "@/lib/blotato/types";
import type { Platform } from "@/lib/types";

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
    const { captionId, imageId, accountId, platform, pageId, scheduledTime } =
      body as {
        captionId?: string;
        imageId?: string;
        accountId?: string;
        platform?: Platform;
        pageId?: string;
        scheduledTime?: string;
      };

    if (!captionId || !imageId || !accountId || !platform) {
      return NextResponse.json(
        { error: "captionId, imageId, accountId, and platform are required" },
        { status: 400 }
      );
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const [captionResult, imageResult, settingsResult] = await Promise.all([
      supabase.from("captions").select("*").eq("id", captionId).single(),
      supabase
        .from("generated_images")
        .select("id, image_url")
        .eq("id", imageId)
        .single(),
      supabase.from("caption_settings").select("blotato_api_key").limit(1),
    ]);

    if (captionResult.error || !captionResult.data) {
      return NextResponse.json(
        { error: "Caption not found" },
        { status: 404 }
      );
    }

    if (imageResult.error || !imageResult.data) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    const blotatoKey =
      settingsResult.data?.[0]?.blotato_api_key || process.env.BLOTATO_API_KEY;

    if (!blotatoKey) {
      return NextResponse.json(
        { error: "Blotato API key not configured" },
        { status: 400 }
      );
    }

    const caption = captionResult.data;
    const image = imageResult.data;
    const client = createBlotatoClient(blotatoKey);

    const hashtags = Array.isArray(caption.hashtags)
      ? caption.hashtags.map((h: string) => `#${h}`).join(" ")
      : "";
    const fullText = hashtags
      ? `${caption.caption_text}\n\n${hashtags}`
      : caption.caption_text;

    const uploaded = await client.uploadMedia(image.image_url);

    const blotatoPlatform = platform as BlotatoPlatform;
    let result;

    if (scheduledTime) {
      const scheduleDate = new Date(scheduledTime);
      if (isNaN(scheduleDate.getTime()) || scheduleDate <= new Date()) {
        return NextResponse.json(
          { error: "scheduledTime must be a valid future ISO 8601 timestamp" },
          { status: 400 }
        );
      }

      result = await client.schedulePost({
        accountId,
        platform: blotatoPlatform,
        text: fullText,
        mediaUrls: [uploaded.url],
        pageId,
        scheduledTime: scheduleDate,
      });
    } else {
      result = await client.publishPost({
        accountId,
        platform: blotatoPlatform,
        text: fullText,
        mediaUrls: [uploaded.url],
        pageId,
      });
    }

    const status = scheduledTime ? "scheduled" : "published";

    await supabase.from("scheduled_posts").insert({
      image_id: imageId,
      caption_id: captionId,
      platform,
      blotato_post_id: result.postId,
      blotato_account_id: accountId,
      status,
      scheduled_time: scheduledTime || null,
      published_time: scheduledTime ? null : new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      postId: result.postId,
      status,
    });
  } catch (error: unknown) {
    console.error("[publish] Error:", error);

    if (error instanceof BlotatoError) {
      return NextResponse.json(
        { error: error.message, blotato_status: error.status },
        { status: error.status >= 400 ? error.status : 500 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Publishing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
