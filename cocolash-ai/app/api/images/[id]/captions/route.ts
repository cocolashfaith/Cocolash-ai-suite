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
      .from("captions")
      .select("*")
      .eq("image_id", imageId)
      .order("generated_at", { ascending: false });

    if (error) {
      console.error("[images/captions] GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch captions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ captions: data ?? [] });
  } catch (error: unknown) {
    console.error("[images/captions] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch captions" },
      { status: 500 }
    );
  }
}
