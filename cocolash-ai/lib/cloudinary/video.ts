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
 * Uses eager transformations to pre-generate mp4 + webm versions.
 */
export async function uploadVideoFromUrl(
  videoUrl: string,
  options?: { title?: string; tags?: string[] }
): Promise<VideoUploadResult> {
  ensureConfigured();

  const result: UploadApiResponse = await cloudinary.uploader.upload(videoUrl, {
    resource_type: "video",
    folder: VIDEO_FOLDER,
    eager: [
      { format: "mp4", quality: "auto" },
      { format: "webm", quality: "auto" },
    ],
    eager_async: true,
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
        eager: [
          { format: "mp4", quality: "auto" },
          { format: "webm", quality: "auto" },
        ],
        eager_async: true,
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
 * Generate a thumbnail URL from a video's first frame.
 * Returns a JPEG URL at the specified dimensions.
 */
export function getThumbnailUrl(
  publicId: string,
  options?: { width?: number; height?: number; time?: string }
): string {
  ensureConfigured();

  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    format: "jpg",
    transformation: [
      {
        width: options?.width ?? 640,
        height: options?.height ?? 360,
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
 */
export function getThumbnailOptions(
  publicId: string,
  durationSeconds: number,
  count: number = 4
): string[] {
  ensureConfigured();

  const interval = durationSeconds / (count + 1);
  return Array.from({ length: count }, (_, i) => {
    const time = Math.round(interval * (i + 1));
    return getThumbnailUrl(publicId, { time: String(time) });
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
