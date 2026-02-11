/**
 * GET /api/images/[id]/download — Download image with Content-Disposition
 *
 * Fetches the image from Supabase Storage and returns it as an
 * attachment with a descriptive filename.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Fetch image record for metadata
    const { data: image, error } = await supabase
      .from("generated_images")
      .select("id, image_url, category, aspect_ratio, created_at, storage_path")
      .eq("id", id)
      .single();

    if (error || !image) {
      return NextResponse.json(
        { error: "Image not found." },
        { status: 404 }
      );
    }

    // Build a descriptive filename
    const date = new Date(image.created_at).toISOString().split("T")[0];
    const filename = `cocolash-${image.category}-${image.aspect_ratio.replace(":", "x")}-${date}-${image.id.substring(0, 8)}.png`;

    // Fetch the actual image data from the public URL
    const imageUrl = image.image_url.split("?")[0]; // Strip cache busters
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image from storage." },
        { status: 502 }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();

    // Return with Content-Disposition: attachment header
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": imageBuffer.byteLength.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Image download error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
