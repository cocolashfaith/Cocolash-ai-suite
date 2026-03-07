import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Hashtag, Platform } from "@/lib/types";

const VALID_PLATFORMS: Platform[] = ["instagram", "tiktok", "twitter", "facebook", "linkedin"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();

    const allowedFields = [
      "tag",
      "category",
      "sub_category",
      "platforms",
      "popularity_score",
      "is_active",
      "is_branded",
    ];

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "platforms") {
          const invalidPlatforms = body.platforms.filter(
            (p: string) => !VALID_PLATFORMS.includes(p as Platform)
          );
          if (invalidPlatforms.length > 0) {
            return NextResponse.json(
              { error: `Invalid platforms: ${invalidPlatforms.join(", ")}` },
              { status: 400 }
            );
          }
          updates.platform = body.platforms;
        } else {
          updates[field] = body[field];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("hashtags")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update hashtag:", error.message);
      return NextResponse.json(
        { error: "Failed to update hashtag." },
        { status: error.code === "PGRST116" ? 404 : 500 }
      );
    }

    return NextResponse.json({ hashtag: data as Hashtag });
  } catch (error) {
    console.error("Hashtag PATCH error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from("hashtags")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Failed to soft-delete hashtag:", error.message);
      return NextResponse.json(
        { error: "Failed to delete hashtag." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Hashtag DELETE error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
