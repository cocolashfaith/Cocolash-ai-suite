import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CaptionStyle } from "@/lib/types";

const VALID_STYLES: CaptionStyle[] = [
  "casual",
  "professional",
  "promotional",
  "storytelling",
  "question",
];

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("caption_settings")
      .select("*")
      .limit(1);

    if (error) {
      console.error("[settings/captions] GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch caption settings" },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      const { data: created, error: insertError } = await supabase
        .from("caption_settings")
        .insert({
          brand_voice_prompt: null,
          default_style: "casual",
          always_include_hashtags: [],
          never_include_hashtags: [],
          default_cta: null,
          blotato_api_key: null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[settings/captions] Seed error:", insertError);
        return NextResponse.json(
          { error: "Failed to create default settings" },
          { status: 500 }
        );
      }

      return NextResponse.json(created);
    }

    return NextResponse.json(data[0]);
  } catch (error: unknown) {
    console.error("[settings/captions] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch caption settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createClient();

    const updates: Record<string, unknown> = {};

    if (typeof body.brand_voice_prompt === "string") {
      updates.brand_voice_prompt = body.brand_voice_prompt.trim() || null;
    }

    if (
      typeof body.default_style === "string" &&
      VALID_STYLES.includes(body.default_style as CaptionStyle)
    ) {
      updates.default_style = body.default_style;
    }

    if (Array.isArray(body.always_include_hashtags)) {
      updates.always_include_hashtags = body.always_include_hashtags.filter(
        (h: unknown) => typeof h === "string" && h.trim()
      );
    }

    if (Array.isArray(body.never_include_hashtags)) {
      updates.never_include_hashtags = body.never_include_hashtags.filter(
        (h: unknown) => typeof h === "string" && h.trim()
      );
    }

    if (typeof body.default_cta === "string") {
      updates.default_cta = body.default_cta.trim() || null;
    }

    if (typeof body.blotato_api_key === "string") {
      updates.blotato_api_key = body.blotato_api_key.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data: existing } = await supabase
      .from("caption_settings")
      .select("id")
      .limit(1);

    if (!existing || existing.length === 0) {
      const { data: created, error: insertError } = await supabase
        .from("caption_settings")
        .insert({
          brand_voice_prompt: null,
          default_style: "casual",
          always_include_hashtags: [],
          never_include_hashtags: [],
          default_cta: null,
          blotato_api_key: null,
          ...updates,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[settings/captions] Insert error:", insertError);
        return NextResponse.json(
          { error: "Failed to create settings" },
          { status: 500 }
        );
      }

      return NextResponse.json(created);
    }

    const { data, error } = await supabase
      .from("caption_settings")
      .update(updates)
      .eq("id", existing[0].id)
      .select()
      .single();

    if (error || !data) {
      console.error("[settings/captions] Update error:", error);
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("[settings/captions] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
