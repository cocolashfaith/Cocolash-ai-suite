import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TONE_KEYWORDS, BRAND_COLORS, COLOR_RULE } from "@/lib/constants/brand";
import { MASTER_BRAND_DNA } from "@/lib/prompts/brand-dna";
import { DEFAULT_NEGATIVE_PROMPT } from "@/lib/prompts/negative";

/**
 * GET /api/brand — Fetch the brand profile.
 *
 * Returns the first (and only) brand profile from the database.
 * If no profile exists, auto-seeds the default CocoLash profile.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Try to fetch existing profile
    const { data: profile, error } = await supabase
      .from("brand_profiles")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = "no rows returned" — that's expected if no profile exists
      console.error("Error fetching brand profile:", error);
      return NextResponse.json(
        { error: "Failed to fetch brand profile" },
        { status: 500 }
      );
    }

    // If profile exists, return it
    if (profile) {
      return NextResponse.json({ profile });
    }

    // No profile exists — seed defaults
    const defaultProfile = {
      name: "CocoLash",
      color_palette: {
        primary: BRAND_COLORS.primary,
        secondary: BRAND_COLORS.secondary,
        accents: BRAND_COLORS.accents,
        rule: COLOR_RULE,
      },
      tone_keywords: [...DEFAULT_TONE_KEYWORDS],
      brand_dna_prompt: MASTER_BRAND_DNA,
      negative_prompt: DEFAULT_NEGATIVE_PROMPT,
    };

    const { data: newProfile, error: insertError } = await supabase
      .from("brand_profiles")
      .insert(defaultProfile)
      .select()
      .single();

    if (insertError) {
      console.error("Error seeding brand profile:", insertError);
      return NextResponse.json(
        { error: "Failed to create default brand profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: newProfile });
  } catch (err) {
    console.error("Brand API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/brand — Update the brand profile.
 *
 * Accepts partial updates: tone_keywords, brand_dna_prompt, negative_prompt,
 * logo URLs. Color palette is read-only (hardcoded brand identity).
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createClient();

    // Fetch the existing profile to get the ID
    const { data: existing, error: fetchError } = await supabase
      .from("brand_profiles")
      .select("id")
      .limit(1)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Brand profile not found" },
        { status: 404 }
      );
    }

    // Build the update object — only allow specific fields
    const allowedFields = [
      "tone_keywords",
      "brand_dna_prompt",
      "negative_prompt",
      "logo_white_url",
      "logo_dark_url",
      "logo_gold_url",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Add updated_at timestamp
    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("brand_profiles")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating brand profile:", updateError);
      return NextResponse.json(
        { error: "Failed to update brand profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: updated });
  } catch (err) {
    console.error("Brand API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
