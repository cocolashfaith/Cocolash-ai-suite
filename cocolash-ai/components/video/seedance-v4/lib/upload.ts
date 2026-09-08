/**
 * Shared client-side uploader for the v4 Seedance wizard — Seedance 2.5 (D6).
 *
 * Target bucket: `video-inputs` (public, 50 MB, audio/video/image MIME
 * allow-list). Two paths, chosen by `kind`:
 *
 *   image → POST /api/video-inputs/upload (multipart `file` + `kind`).
 *           Server-side so the image is normalised to PNG/JPEG
 *           (toEnhancorCompatibleImage) — Enhancor rejects WebP/AVIF/HEIC.
 *           Images are ≤ 10 MB.
 *
 *   video / audio → POST /api/video-inputs/sign (JSON) to get a signed
 *           upload URL, then the browser PUTs the bytes STRAIGHT to Supabase
 *           Storage with `uploadToSignedUrl`. This bypasses Vercel's 4.5 MB
 *           request-body limit on route handlers (a 50 MB clip can never go
 *           through a serverless function) and needs no anon storage policy
 *           (the signed token was minted with the service role).
 *
 * Both routes live in app/api/video-inputs/* and are authenticated by the
 * middleware like every other /api route.
 *
 * Contract for /api/video-inputs/sign response:
 *   { path: string; token: string; signedUrl: string; publicUrl: string }
 * Contract for /api/video-inputs/upload response:
 *   { url: string; path: string; kind: VideoInputKind; contentType: string; size: number }
 */

import { createClient } from "@/lib/supabase/client";
import { BUCKETS, VIDEO_INPUTS_MAX_BYTES } from "@/lib/supabase/storage";

export type VideoInputKind = "image" | "video" | "audio";

export interface UploadResult {
  /** Public https URL — this is what goes into the Enhancor payload. */
  url: string;
  path: string;
  kind?: VideoInputKind;
  contentType?: string;
  size?: number;
}

/** Images go through sharp on the server; keep them modest. */
export const IMAGE_INPUT_MAX_BYTES = 10 * 1024 * 1024;

/** 50 MB — bucket limit for video/audio. */
export const VIDEO_INPUT_MAX_BYTES = VIDEO_INPUTS_MAX_BYTES;

export function kindForFile(file: File): VideoInputKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

/** Client-side pre-check (the server re-validates). Returns an error string or null. */
export function validateVideoInputFile(file: File, kind: VideoInputKind): string | null {
  const detected = kindForFile(file);
  if (detected !== kind) return `"${file.name}" is not a ${kind} file.`;
  const limit = kind === "image" ? IMAGE_INPUT_MAX_BYTES : VIDEO_INPUT_MAX_BYTES;
  if (file.size > limit) {
    return `"${file.name}" is over ${Math.round(limit / (1024 * 1024))} MB.`;
  }
  return null;
}

async function uploadImageViaServer(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "image");
  const res = await fetch("/api/video-inputs/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
  if (!res.ok || !data.url || !data.path) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return {
    url: data.url,
    path: data.path,
    kind: "image",
    contentType: data.contentType,
    size: data.size,
  };
}

async function uploadMediaViaSignedUrl(file: File, kind: "video" | "audio"): Promise<UploadResult> {
  const signRes = await fetch("/api/video-inputs/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const sign = (await signRes.json().catch(() => ({}))) as {
    path?: string;
    token?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!signRes.ok || !sign.path || !sign.token || !sign.publicUrl) {
    throw new Error(sign.error || `Could not prepare upload (${signRes.status})`);
  }

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKETS.VIDEO_INPUTS)
    .uploadToSignedUrl(sign.path, sign.token, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
  if (error) {
    throw new Error(error.message || "Upload failed");
  }

  return { url: sign.publicUrl, path: sign.path, kind, contentType: file.type, size: file.size };
}

/**
 * Upload one file for use as a Seedance input. Resolves to a PUBLIC URL.
 * Throws with a user-readable message on validation or transport failure.
 */
export async function uploadVideoInput(file: File, kind: VideoInputKind): Promise<UploadResult> {
  const problem = validateVideoInputFile(file, kind);
  if (problem) throw new Error(problem);
  if (kind === "image") return uploadImageViaServer(file);
  return uploadMediaViaSignedUrl(file, kind);
}

/**
 * @deprecated Use `uploadVideoInput`. Kept so the pre-2.5 mode components
 * compile until Wave 1 (package D) migrates them. Same signature.
 */
export const uploadSeedanceMedia = uploadVideoInput;
