import { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

/**
 * Supabase Storage Helpers
 *
 * Centralized functions for uploading, downloading, and managing
 * files in Supabase Storage buckets.
 *
 * NOTE: keep this module free of native deps (e.g. `sharp`). It is imported
 * widely (incl. non-Node bundles), and pulling a native binding in here breaks
 * the Turbopack build. Image transcoding lives in
 * `lib/image-processing/enhancor-image.ts`.
 */

// ── Storage Bucket Names ──────────────────────────────────────
export const BUCKETS = {
  GENERATED_IMAGES: "generated-images",
  BRAND_ASSETS: "brand-assets",
  // ── Milestone v3.0 (chatbot) buckets ───────────────────────
  // Both private; service-role + chat admins only.
  CHAT_KB_UPLOADS: "chat-kb-uploads",
  CHAT_SELFIES: "chat-selfies",
  // ── Seedance 2.5 (D6) — audio/video/image reference inputs ──
  // Public bucket, 50 MB cap, MIME allow-list: video/mp4|quicktime|webm|x-m4v,
  // audio/mpeg|mp3|wav|x-wav|wave|mp4|x-m4a|m4a|aac|ogg|webm|flac,
  // image/png|jpeg|webp. Created 2026-09-08 via the service-role API; the
  // 20260908_seedance25.sql migration re-asserts it idempotently.
  // Uploads go through /api/video-inputs/* (see components/video/seedance-v4/lib/upload.ts).
  VIDEO_INPUTS: "video-inputs",
} as const;

/** MIME types the `video-inputs` bucket accepts (mirror of the bucket config). */
export const VIDEO_INPUTS_ALLOWED_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** 50 MB — the `video-inputs` bucket's file_size_limit. */
export const VIDEO_INPUTS_MAX_BYTES = 50 * 1024 * 1024;

// ── Upload Generated Image ────────────────────────────────────
export async function uploadGeneratedImage(
  supabase: SupabaseClient,
  buffer: Buffer,
  brandId: string,
  suffix: string = "",
  mimeType: string = "image/png"
): Promise<{ url: string; path: string }> {
  const ext = mimeType === "image/jpeg" ? "jpg" : "png";
  const filename = `${brandId}/${uuidv4()}${suffix}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKETS.GENERATED_IMAGES)
    .upload(filename, buffer, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from(BUCKETS.GENERATED_IMAGES)
    .getPublicUrl(filename);

  return { url: publicUrl, path: filename };
}

// ── Upload Brand Asset (Logo) ─────────────────────────────────
export async function uploadBrandAsset(
  supabase: SupabaseClient,
  file: File | Blob,
  variant: "white" | "dark" | "gold"
): Promise<{ url: string; path: string }> {
  const ext = file instanceof File ? file.name.split(".").pop() || "png" : "png";
  const filename = `logos/logo-${variant}.${ext}`;

  // Upsert to overwrite existing logo variant
  const { error } = await supabase.storage
    .from(BUCKETS.BRAND_ASSETS)
    .upload(filename, file, {
      contentType: file.type || "image/png",
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload brand asset: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from(BUCKETS.BRAND_ASSETS)
    .getPublicUrl(filename);

  // Add cache-buster to force browser refresh
  return { url: `${publicUrl}?t=${Date.now()}`, path: filename };
}

// ── Upload Product Reference Image ─────────────────────────────
export async function uploadProductImage(
  supabase: SupabaseClient,
  file: File | Blob,
  index: number
): Promise<{ url: string; path: string }> {
  const ext = file instanceof File ? file.name.split(".").pop() || "png" : "png";
  const filename = `products/product-${index}-${uuidv4()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKETS.BRAND_ASSETS)
    .upload(filename, file, {
      contentType: file.type || "image/png",
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload product image: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from(BUCKETS.BRAND_ASSETS)
    .getPublicUrl(filename);

  return { url: `${publicUrl}?t=${Date.now()}`, path: filename };
}

/**
 * Upload a product reference image to a CALLER-CHOSEN path in `brand-assets`.
 *
 * Differs from `uploadProductImage` in two ways that the Shopify re-hosting
 * seed (D7) depends on:
 *   - the path is deterministic (`products/shopify/<handle>-<n>.png`), so a
 *     re-run overwrites the same object instead of orphaning the old one, and
 *     the script stays idempotent;
 *   - the returned URL has NO `?t=` cache-buster, so it is stable enough to
 *     store in `product_reference_images.image_url` and to dedupe on.
 *
 * `brand-assets` is image-MIME only and caps at 5 MB — never send audio/video.
 */
export async function uploadProductImageToPath(
  supabase: SupabaseClient,
  file: File | Blob,
  storagePath: string,
  options: { upsert?: boolean } = {}
): Promise<{ url: string; path: string }> {
  const { upsert = true } = options;

  const { error } = await supabase.storage
    .from(BUCKETS.BRAND_ASSETS)
    .upload(storagePath, file, {
      contentType: file.type || "image/png",
      cacheControl: "3600",
      upsert,
    });

  if (error) {
    throw new Error(`Failed to upload product image: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKETS.BRAND_ASSETS).getPublicUrl(storagePath);

  return { url: publicUrl, path: storagePath };
}

// ── Delete Storage File ───────────────────────────────────────
export async function deleteStorageFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

// ── Get Public URL ────────────────────────────────────────────
export function getPublicUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): string {
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}
