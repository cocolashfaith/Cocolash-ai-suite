/**
 * Cloudinary Video Module
 *
 * Handles video upload, transformations (watermark, captions),
 * thumbnail generation, and URL building via the Cloudinary SDK.
 *
 * Architecture note: Cloudinary transformations are URL-based —
 * no server-side FFmpeg required, which keeps this Vercel-compatible.
 */

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

const VIDEO_FOLDER = "cocolash-videos";
const WATERMARK_TEXT = "CocoLash";

let _configured = false;

function ensureConfigured(): void {
  if (_configured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary configuration. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  _configured = true;
}

// ── Types ────────────────────────────────────────────────────

export interface VideoUploadResult {
  publicId: string;
  secureUrl: string;
  format: string;
  duration: number;
  width: number;
  height: number;
  bytes: number;
}

export interface TransformationOptions {
  width?: number;
  height?: number;
  crop?: string;
  quality?: string | number;
  format?: string;
}

// ── Upload ───────────────────────────────────────────────────

/**
 * Upload a video to Cloudinary from a URL.
 *
 * The URL is handed straight to Cloudinary, which fetches the file SERVER-SIDE —
 * the bytes never pass through our request, so the 100 MB "synchronous upload"
 * per-request ceiling does NOT apply here. The only ceiling is the account's max
 * video file size (2 GB on the paid PAYG plan; the old 100 MB "File size too
 * large" 400 was the Free-plan account cap, resolved by the plan upgrade).
 *
 * F15: this used to request eager mp4 + webm renders at `quality: "auto"`.
 * Nothing ever referenced those derived assets — `final_video_url` is the
 * plain `secure_url` of the original upload, and the watermark/caption helpers
 * below build their own URL transformations on demand — so they were pure
 * wasted transformation credits. Removed along with `eager_async`, which only
 * existed to keep them off the synchronous transform path.
 *
 * NOTE: if a very large remote file ever fails the server-side fetch on the paid
 * plan, the fix is to download it and use `upload_chunked_stream` (the real
 * chunked-stream method — `upload_large_stream` from the typings does NOT exist
 * at runtime). Not needed for current 1080p output.
 */
export async function uploadVideoFromUrl(
  videoUrl: string,
  options?: { title?: string; tags?: string[] }
): Promise<VideoUploadResult> {
  ensureConfigured();

  const result: UploadApiResponse = await cloudinary.uploader.upload(videoUrl, {
    resource_type: "video",
    folder: VIDEO_FOLDER,
    tags: options?.tags ?? ["cocolash", "ugc"],
    context: options?.title ? `caption=${options.title}` : undefined,
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    format: result.format,
    duration: result.duration ?? 0,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
  };
}

/**
 * Upload a video from a Buffer (in-memory).
 *
 * Like `uploadVideoFromUrl`, this requests no eager derivatives (F15).
 */
export async function uploadVideoFromBuffer(
  buffer: Buffer,
  options?: { title?: string; tags?: string[] }
): Promise<VideoUploadResult> {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: VIDEO_FOLDER,
        tags: options?.tags ?? ["cocolash", "ugc"],
        context: options?.title ? `caption=${options.title}` : undefined,
      },
      (error, result) => {
        if (error || !result) {
          reject(new Error(`Cloudinary upload failed: ${error?.message ?? "no result"}`));
          return;
        }
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          format: result.format,
          duration: result.duration ?? 0,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

// ── Transformations (URL-based) ─────────────────────────────

/**
 * Get a video URL with a text watermark overlay.
 * Places "CocoLash" in the bottom-right corner with semi-transparent white text.
 */
export function getWatermarkedUrl(publicId: string): string {
  ensureConfigured();

  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    transformation: [
      {
        overlay: {
          font_family: "Montserrat",
          font_size: 28,
          font_weight: "bold",
          text: WATERMARK_TEXT,
        },
        color: "#FFFFFFCC",
        gravity: "south_east",
        x: 20,
        y: 20,
      },
      { quality: "auto", format: "mp4" },
    ],
  });
}

/**
 * Get a video URL with a logo image overlay as watermark.
 * The logo is placed in the bottom-right corner at reduced opacity.
 */
export function getLogoWatermarkedUrl(
  publicId: string,
  logoPublicId: string
): string {
  ensureConfigured();

  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    transformation: [
      {
        overlay: logoPublicId.replace(/\//g, ":"),
        width: 120,
        opacity: 70,
        gravity: "south_east",
        x: 20,
        y: 20,
      },
      { quality: "auto", format: "mp4" },
    ],
  });
}

/**
 * Get a video URL with subtitle text overlay.
 * Cloudinary supports SRT/VTT-style subtitles via the `subtitles` overlay.
 *
 * For simple single-line captions, uses text overlay at the bottom.
 * For full SRT, upload the SRT as a raw file and reference by public_id.
 */
export function getCaptionedUrl(
  publicId: string,
  srtPublicId?: string
): string {
  ensureConfigured();

  if (srtPublicId) {
    return cloudinary.url(publicId, {
      resource_type: "video",
      secure: true,
      transformation: [
        {
          overlay: {
            resource_type: "subtitles",
            public_id: srtPublicId,
          },
        },
        { quality: "auto", format: "mp4" },
      ],
    });
  }

  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    transformation: [{ quality: "auto", format: "mp4" }],
  });
}

/**
 * Upload an SRT subtitle file to Cloudinary as a raw resource.
 * Returns the public_id to reference in video transformations.
 */
export async function uploadSRT(
  srtContent: string,
  videoPublicId: string
): Promise<string> {
  ensureConfigured();

  const srtBuffer = Buffer.from(srtContent, "utf-8");
  const srtName = `${videoPublicId.replace(/\//g, "_")}_captions`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id: srtName,
        folder: VIDEO_FOLDER,
        format: "srt",
      },
      (error, result) => {
        if (error || !result) {
          reject(new Error(`SRT upload failed: ${error?.message ?? "no result"}`));
          return;
        }
        resolve(result.public_id);
      }
    );

    uploadStream.end(srtBuffer);
  });
}

// ── Thumbnail ────────────────────────────────────────────────

/**
 * How the caller describes the source video's shape (F14). Either real pixel
 * dimensions — Cloudinary reports `width`/`height` on every upload — or a wire
 * aspect string such as "9:16", "16:9", "1:1". Pixels win when both are given.
 */
export interface ThumbnailAspectSource {
  width?: number | null;
  height?: number | null;
  aspectRatio?: string | null;
}

/** Long edge of a derived thumbnail, in pixels. */
const THUMBNAIL_LONG_EDGE = 640;

/**
 * The historical 16:9 box. Still the answer when the aspect is unknown, so
 * callers that never learned the video's shape behave exactly as before.
 */
const FALLBACK_THUMBNAIL = { width: 640, height: 360 } as const;

function aspectRatioOf(source?: ThumbnailAspectSource): number | null {
  if (!source) return null;

  const { width, height } = source;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }

  const match = source.aspectRatio?.trim().match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (match) {
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (w > 0 && h > 0) return w / h;
  }

  return null;
}

/**
 * Thumbnail box for a video's REAL aspect (F14).
 *
 * The long edge is pinned at 640 px, so 16:9 stays 640x360 and 9:16 becomes
 * 360x640 instead of being centre-cropped into a landscape strip. Square and
 * anything else scale the same way; an unknown aspect falls back to 640x360.
 */
export function thumbnailDimensions(
  source?: ThumbnailAspectSource
): { width: number; height: number } {
  const ratio = aspectRatioOf(source);
  if (ratio === null) return { ...FALLBACK_THUMBNAIL };

  return ratio >= 1
    ? { width: THUMBNAIL_LONG_EDGE, height: Math.round(THUMBNAIL_LONG_EDGE / ratio) }
    : { width: Math.round(THUMBNAIL_LONG_EDGE * ratio), height: THUMBNAIL_LONG_EDGE };
}

/**
 * Generate a thumbnail URL from a video's first frame.
 * Returns a JPEG URL at the specified dimensions.
 *
 * Pass `aspect` (the source video's pixel dimensions or its aspect string) and
 * the box is derived from it. Explicit `width`/`height` still win, and with
 * neither the old 640x360 default applies.
 */
export function getThumbnailUrl(
  publicId: string,
  options?: {
    width?: number;
    height?: number;
    time?: string;
    aspect?: ThumbnailAspectSource;
  }
): string {
  ensureConfigured();

  const derived = thumbnailDimensions(options?.aspect);

  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    format: "jpg",
    transformation: [
      {
        width: options?.width ?? derived.width,
        height: options?.height ?? derived.height,
        crop: "fill",
        gravity: "auto",
        quality: "auto:good",
        start_offset: options?.time ?? "0",
      },
    ],
  });
}

/**
 * Generate multiple thumbnail options at different timestamps.
 * Every option shares the same aspect-derived box.
 */
export function getThumbnailOptions(
  publicId: string,
  durationSeconds: number,
  count: number = 4,
  aspect?: ThumbnailAspectSource
): string[] {
  ensureConfigured();

  const interval = durationSeconds / (count + 1);
  return Array.from({ length: count }, (_, i) => {
    const time = Math.round(interval * (i + 1));
    return getThumbnailUrl(publicId, { time: String(time), aspect });
  });
}

// ── URL Helpers ──────────────────────────────────────────────

/**
 * Get a transformed video URL with custom options.
 */
export function getVideoUrl(
  publicId: string,
  options?: TransformationOptions
): string {
  ensureConfigured();

  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    transformation: [
      {
        width: options?.width,
        height: options?.height,
        crop: options?.crop ?? "limit",
        quality: options?.quality ?? "auto",
        format: options?.format ?? "mp4",
      },
    ],
  });
}

/**
 * Delete a video from Cloudinary.
 */
export async function deleteVideo(publicId: string): Promise<void> {
  ensureConfigured();

  await cloudinary.uploader.destroy(publicId, {
    resource_type: "video",
  });
}
