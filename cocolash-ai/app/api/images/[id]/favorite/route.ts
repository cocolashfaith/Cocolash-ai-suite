import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/images/[id]/favorite — Toggle favorite status
 *
 * Flips the `is_favorite` boolean on the specified image.
 * Returns the updated image record.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("generated_images")
      .select("id, is_favorite")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Image not found." },
        { status: 404 }
      );
    }

    const newValue = !existing.is_favorite;

    const { data, error } = await supabase
      .from("generated_images")
      .update({ is_favorite: newValue })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to toggle favorite:", error.message);
      return NextResponse.json(
        { error: "Failed to update favorite status." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      image: data,
      is_favorite: newValue,
    });
  } catch (error) {
    console.error("Favorite toggle error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
