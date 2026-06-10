/**
 * POST /api/images/upload
 *
 * Generic image upload used by the Seedance UGC wizard's "Upload Influencer"
 * tab (Step 2). The uploaded image becomes a Seedance reference (influencers[]),
 * so it MUST be PNG/JPEG — WebP/AVIF/etc. are transcoded to PNG before storage.
 *
 * Returns { success, image: { image_url, storage_path } }.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { uploadGeneratedImage } from "@/lib/supabase/storage";
import { toEnhancorCompatibleImage } from "@/lib/image-processing/enhancor-image";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Multipart 'file' field is required" },
        { status: 400 }
      );
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image must be under 10 MB" },
        { status: 400 }
      );
    }

    // Enhancor (Seedance) only accepts PNG/JPEG — normalise before storing.
    const compatible = await toEnhancorCompatibleImage(file);
    const buffer = Buffer.from(await compatible.arrayBuffer());

    const supabase = await createAdminClient();
    const { url, path } = await uploadGeneratedImage(
      supabase,
      buffer,
      "cocolash",
      "-influencer-upload",
      compatible.type
    );

    return NextResponse.json({
      success: true,
      image: { image_url: url, storage_path: path },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("[images/upload] error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
