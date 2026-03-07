import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Platform } from "@/lib/types";

const VALID_PLATFORMS: Platform[] = [
  "instagram",
  "tiktok",
  "twitter",
  "facebook",
  "linkedin",
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("captions")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Caption not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("[captions/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch caption" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = await createClient();

    const updates: Record<string, unknown> = {};

    if (typeof body.caption_text === "string" && body.caption_text.trim()) {
      updates.caption_text = body.caption_text.trim();
      updates.character_count = body.caption_text.trim().length;
    }

    if (Array.isArray(body.hashtags)) {
      updates.hashtags = body.hashtags.filter(
        (h: unknown) => typeof h === "string" && h.trim()
      );
    }

    if (typeof body.is_selected === "boolean") {
      updates.is_selected = body.is_selected;

      if (body.is_selected) {
        const { data: current } = await supabase
          .from("captions")
          .select("image_id, platform")
          .eq("id", id)
          .single();

        if (current) {
          await supabase
            .from("captions")
            .update({ is_selected: false })
            .eq("image_id", current.image_id)
            .eq("platform", current.platform)
            .neq("id", id);
        }
      }
    }

    if (
      typeof body.platform === "string" &&
      VALID_PLATFORMS.includes(body.platform as Platform)
    ) {
      updates.platform = body.platform;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("captions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Caption not found or update failed" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("[captions/[id]] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update caption" },
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

    const { error } = await supabase.from("captions").delete().eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete caption" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[captions/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete caption" },
      { status: 500 }
    );
  }
}
