/**
 * POST /api/video-inputs/upload — multipart upload into the public
 * `video-inputs` bucket (Seedance 2.5, D6).
 *
 * IMPORTANT — this route is for IMAGES. Vercel caps a route handler's request
 * body at ~4.5 MB, so a 50 MB video or audio file can never reach it; the
 * wizard sends those straight to Storage through
 * `POST /api/video-inputs/sign` + `uploadToSignedUrl` instead
 * (components/video/seedance-v4/lib/upload.ts). Images come here because they
 * must be normalised server-side: Enhancor rejects WebP/AVIF/GIF/HEIC with a
 * 400, so `toEnhancorCompatibleImage` (sharp) transcodes anything that is not
 * already PNG/JPEG before the bytes are stored. Video/audio are still accepted
 * and validated here for completeness (small clips), they just cannot be large.
 *
 * Contract (§2.11):
 *   multipart  file (+ optional kind)
 *   200        { url, path, kind, contentType, size }
 *   400        { error }  — not multipart / no file / bad MIME / over size
 *   500        { error }  — storage failure
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { BUCKETS } from "@/lib/supabase/storage";
import {
  UnsupportedImageError,
  toEnhancorCompatibleImage,
} from "@/lib/image-processing/enhancor-image";
import {
  buildVideoInputPath,
  isVideoInputKind,
  kindForMime,
  normalizeContentType,
  validateVideoInput,
} from "@/lib/video-inputs/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data body with a 'file' field" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Multipart 'file' field is required" },
      { status: 400 }
    );
  }

  const declaredKind = form.get("kind");
  const contentType = normalizeContentType(file.type);
  const kind = isVideoInputKind(declaredKind)
    ? declaredKind
    : kindForMime(contentType);

  if (!kind) {
    return NextResponse.json(
      {
        error: `"${file.name}" is a ${contentType || "unknown"} file, which is not supported. Use MP4/MOV/WebM video, MP3/WAV/M4A audio, or PNG/JPEG/WebP images.`,
      },
      { status: 400 }
    );
  }

  const check = validateVideoInput({
    kind,
    contentType,
    size: file.size,
    filename: file.name,
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  try {
    // Images become Seedance references, so normalise to PNG/JPEG first. The
    // declared MIME is never trusted: `toEnhancorCompatibleImage` sniffs the
    // magic bytes and re-encodes (or rejects) anything that disagrees, so a
    // "PNG" that is really a script can't be stored as-is. The transcode can
    // change the MIME (webp → png), so the stored extension and the reported
    // contentType come from the RESULT, not the upload.
    const payload = kind === "image" ? await toEnhancorCompatibleImage(file) : file;
    const finalContentType =
      kind === "image" ? normalizeContentType(payload.type) || contentType : contentType;
    const finalCheck = validateVideoInput({
      kind,
      contentType: finalContentType,
      size: payload.size || file.size,
      filename: file.name,
    });
    if (!finalCheck.ok) {
      return NextResponse.json({ error: finalCheck.error }, { status: 400 });
    }

    const path = buildVideoInputPath(kind, finalCheck.ext);

    const supabase = await createAdminClient();
    const bucket = supabase.storage.from(BUCKETS.VIDEO_INPUTS);

    const { error } = await bucket.upload(path, payload, {
      contentType: finalContentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      console.error("[video-inputs/upload] storage upload failed:", error.message);
      return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = bucket.getPublicUrl(path);

    return NextResponse.json({
      url: publicUrl,
      path,
      kind,
      contentType: finalContentType,
      size: payload.size || file.size,
    });
  } catch (error: unknown) {
    // Bytes that are not a decodable image are the CLIENT's problem (400), not
    // a server failure — and they are never stored.
    if (error instanceof UnsupportedImageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("[video-inputs/upload] error:", message);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
