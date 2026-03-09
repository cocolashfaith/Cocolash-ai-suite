/**
 * GET /api/images/[id] — Single image detail
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import type { GeneratedImage } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const userId = await getCurrentUserId(supabase);

    let query = supabase
      .from("generated_images")
      .select("*")
      .eq("id", id);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Image not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ image: data as GeneratedImage });
  } catch (error) {
    console.error("Image detail error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
