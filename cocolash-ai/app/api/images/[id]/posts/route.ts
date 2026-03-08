import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: imageId } = await params;

    if (!imageId) {
      return NextResponse.json({ error: "Image ID required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("image_id", imageId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[images/posts] GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch publishing history" },
        { status: 500 }
      );
    }

    return NextResponse.json({ posts: data ?? [] });
  } catch (error: unknown) {
    console.error("[images/posts] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch publishing history" },
      { status: 500 }
    );
  }
}
