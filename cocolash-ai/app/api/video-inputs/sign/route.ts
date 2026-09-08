/**
 * POST /api/video-inputs/sign — mint a one-shot signed upload URL for the
 * public `video-inputs` bucket (Seedance 2.5, D6).
 *
 * WHY a signed URL rather than a multipart route: Vercel caps a route
 * handler's request body at ~4.5 MB, and the bucket accepts files up to
 * 50 MB. A 30 MB reference clip therefore CANNOT travel through a serverless
 * function — the browser must PUT it straight to Supabase Storage. This route
 * only validates the declared file and returns the token; the bytes never
 * touch our function.
 *
 * The token is minted with the service role, so the bucket needs no anon
 * INSERT policy. `path` is server-chosen (UUID), so a caller cannot overwrite
 * someone else's object or escape the kind/date prefix.
 *
 * Contract (§2.11):
 *   body  { kind, filename, contentType, size }
 *   200   { path, token, signedUrl, publicUrl, kind, contentType }
 *   400   { error }   — bad MIME / size / kind mismatch / malformed body
 *   500   { error }   — Storage refused to mint a token
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { BUCKETS } from "@/lib/supabase/storage";
import {
  buildVideoInputPath,
  normalizeContentType,
  validateVideoInput,
} from "@/lib/video-inputs/validation";

export const runtime = "nodejs";

const SignBodySchema = z.object({
  kind: z.enum(["image", "video", "audio"]),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = SignBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "kind, filename, contentType and size are required" },
      { status: 400 }
    );
  }

  const { kind, filename, size } = parsed.data;
  const contentType = normalizeContentType(parsed.data.contentType);

  const check = validateVideoInput({ kind, contentType, size, filename });
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const path = buildVideoInputPath(kind, check.ext);

  try {
    const supabase = await createAdminClient();
    const bucket = supabase.storage.from(BUCKETS.VIDEO_INPUTS);

    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[video-inputs/sign] createSignedUploadUrl failed:", error?.message);
      return NextResponse.json(
        { error: "Could not prepare the upload. Try again." },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = bucket.getPublicUrl(path);

    return NextResponse.json({
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl,
      kind,
      contentType,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sign failed";
    console.error("[video-inputs/sign] error:", message);
    return NextResponse.json(
      { error: "Could not prepare the upload. Try again." },
      { status: 500 }
    );
  }
}
