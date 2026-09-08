/**
 * lib/video-inputs/validation.ts — pure validation for the `video-inputs`
 * bucket (Seedance 2.5, D6).
 *
 * Shared by BOTH upload paths so the rules can never drift:
 *   POST /api/video-inputs/sign   → video/audio, signed direct upload
 *   POST /api/video-inputs/upload → images, multipart + sharp transcode
 *
 * Rules (mirror of the live bucket config):
 *   - contentType must be in VIDEO_INPUTS_ALLOWED_MIME (Storage rejects the
 *     rest at PUT time anyway — better a 400 here than a mystery failure).
 *   - the declared `kind` must match the MIME family.
 *   - size ≤ 50 MB (bucket cap); images ≤ 10 MB (they go through sharp on a
 *     serverless function).
 *
 * No imports beyond `lib/supabase/storage` (constants only) and `uuid`, so the
 * module stays usable from route handlers, scripts and tests alike.
 */

import { v4 as uuidv4 } from "uuid";
import {
  VIDEO_INPUTS_ALLOWED_MIME,
  VIDEO_INPUTS_MAX_BYTES,
} from "@/lib/supabase/storage";

export type VideoInputKind = "image" | "video" | "audio";

export const VIDEO_INPUT_KINDS: ReadonlyArray<VideoInputKind> = [
  "image",
  "video",
  "audio",
];

/** Images are transcoded by `sharp` inside a serverless function — keep modest. */
export const IMAGE_INPUT_MAX_BYTES = 10 * 1024 * 1024;

/** Canonical file extension per allowed MIME type. */
export const EXT_BY_MIME: Readonly<Record<string, string>> = {
  // video
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  // audio
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
  "audio/flac": "flac",
  // image
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const ALLOWED_MIME = new Set<string>(VIDEO_INPUTS_ALLOWED_MIME);

/** Strip parameters ("audio/mpeg; codecs=mp3") and normalise case. */
export function normalizeContentType(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * The bucket family a MIME type belongs to, or null when the bucket does not
 * accept it. Deliberately allow-list driven: `image/gif` and `image/avif` are
 * images but the bucket (and Enhancor) reject them.
 */
export function kindForMime(contentType: string | null | undefined): VideoInputKind | null {
  const mime = normalizeContentType(contentType);
  if (!ALLOWED_MIME.has(mime)) return null;
  const family = mime.split("/")[0];
  if (family === "image" || family === "video" || family === "audio") return family;
  return null;
}

/** True for one of the three input kinds (narrows unknown input from JSON/forms). */
export function isVideoInputKind(value: unknown): value is VideoInputKind {
  return typeof value === "string" && (VIDEO_INPUT_KINDS as string[]).includes(value);
}

/**
 * Make a user-supplied filename safe to echo back in logs/errors. The stored
 * object name is a UUID, so this never influences the storage path — it exists
 * so a crafted name can't smuggle path segments or control characters into a
 * log line.
 */
export function sanitizeFilename(filename: string | null | undefined): string {
  const base = (filename ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || "upload";
}

export interface ValidateVideoInputArgs {
  kind: VideoInputKind;
  contentType: string;
  size: number;
  filename?: string;
}

export type ValidateVideoInputResult =
  | { ok: true; ext: string }
  | { ok: false; error: string };

function mb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/** Server-side gate for every `video-inputs` write. */
export function validateVideoInput(
  args: ValidateVideoInputArgs
): ValidateVideoInputResult {
  const name = sanitizeFilename(args.filename);
  const mime = normalizeContentType(args.contentType);

  if (!isVideoInputKind(args.kind)) {
    return { ok: false, error: `Unknown input kind "${String(args.kind)}".` };
  }

  const detected = kindForMime(mime);
  if (!detected) {
    return {
      ok: false,
      error: `"${name}" is a ${mime || "unknown"} file, which is not supported. Use MP4/MOV/WebM video, MP3/WAV/M4A audio, or PNG/JPEG/WebP images.`,
    };
  }
  if (detected !== args.kind) {
    return {
      ok: false,
      error: `"${name}" is a ${detected} file, not ${args.kind}.`,
    };
  }

  if (!Number.isFinite(args.size) || args.size <= 0) {
    return { ok: false, error: `"${name}" is empty.` };
  }

  const limit = args.kind === "image" ? IMAGE_INPUT_MAX_BYTES : VIDEO_INPUTS_MAX_BYTES;
  if (args.size > limit) {
    return { ok: false, error: `"${name}" is over ${mb(limit)} MB.` };
  }

  return { ok: true, ext: EXT_BY_MIME[mime] };
}

/**
 * Storage object name: `<kind>/<YYYY>/<MM>/<uuid>.<ext>` — kind-partitioned so
 * a bucket listing is browsable, date-partitioned so old inputs are easy to
 * sweep, UUID-named so nothing a user types reaches the path.
 */
export function buildVideoInputPath(
  kind: VideoInputKind,
  ext: string,
  now: Date = new Date()
): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeExt = (ext || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${kind}/${year}/${month}/${uuidv4()}.${safeExt}`;
}
