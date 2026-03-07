import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Platform } from "@/lib/types";

const VALID_PLATFORMS: Platform[] = ["instagram", "tiktok", "twitter", "facebook", "linkedin"];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    if (!Array.isArray(body.hashtags) || body.hashtags.length === 0) {
      return NextResponse.json(
        { error: "hashtags must be a non-empty array." },
        { status: 400 }
      );
    }

    const rows = body.hashtags.map(
      (h: {
        tag: string;
        category: string;
        sub_category?: string;
        platforms: string[];
        popularity_score?: number;
        is_branded?: boolean;
      }) => {
        if (!h.tag || !h.category || !Array.isArray(h.platforms) || h.platforms.length === 0) {
          throw new Error(`Invalid hashtag entry: tag, category, and platforms are required.`);
        }

        const invalid = h.platforms.filter((p) => !VALID_PLATFORMS.includes(p as Platform));
        if (invalid.length > 0) {
          throw new Error(`Invalid platforms for "${h.tag}": ${invalid.join(", ")}`);
        }

        return {
          tag: h.tag,
          category: h.category,
          sub_category: h.sub_category || null,
          platform: h.platforms,
          popularity_score: h.popularity_score ?? 50,
          is_branded: h.is_branded ?? false,
        };
      }
    );

    const { data, error } = await supabase
      .from("hashtags")
      .upsert(rows, { onConflict: "tag" })
      .select();

    if (error) {
      console.error("Bulk hashtag import failed:", error.message);
      return NextResponse.json(
        { error: "Bulk import failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imported: data?.length || 0,
      total: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error("Hashtags bulk POST error:", error);
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
