import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Hashtag, Platform } from "@/lib/types";

const VALID_PLATFORMS: Platform[] = ["instagram", "tiktok", "twitter", "facebook", "linkedin"];
const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category");
    const platform = searchParams.get("platform") as Platform | null;
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive") !== "false";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const offset = (page - 1) * PAGE_SIZE;

    let query = supabase
      .from("hashtags")
      .select("*", { count: "exact" })
      .eq("is_active", isActive)
      .order("popularity_score", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    if (platform && VALID_PLATFORMS.includes(platform)) {
      query = query.contains("platform", [platform]);
    }

    if (search) {
      query = query.ilike("tag", `%${search}%`);
    }

    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error("Failed to fetch hashtags:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch hashtags." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      hashtags: data as Hashtag[],
      total: count || 0,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    console.error("Hashtags GET error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { tag, category, sub_category, platforms, popularity_score, is_branded } = body;

    if (!tag || !category || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { error: "tag, category, and platforms (non-empty array) are required." },
        { status: 400 }
      );
    }

    const invalidPlatforms = platforms.filter((p: string) => !VALID_PLATFORMS.includes(p as Platform));
    if (invalidPlatforms.length > 0) {
      return NextResponse.json(
        { error: `Invalid platforms: ${invalidPlatforms.join(", ")}` },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("hashtags")
      .select("id")
      .eq("tag", tag)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `Hashtag "${tag}" already exists.` },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("hashtags")
      .insert({
        tag,
        category,
        sub_category: sub_category || null,
        platform: platforms,
        popularity_score: popularity_score ?? 50,
        is_branded: is_branded ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create hashtag:", error.message);
      return NextResponse.json(
        { error: "Failed to create hashtag." },
        { status: 500 }
      );
    }

    return NextResponse.json({ hashtag: data as Hashtag }, { status: 201 });
  } catch (error) {
    console.error("Hashtags POST error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
