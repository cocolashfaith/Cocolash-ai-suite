import { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

/**
 * Supabase Storage Helpers
 *
 * Centralized functions for uploading, downloading, and managing
 * files in Supabase Storage buckets.
 */

// ── Storage Bucket Names ──────────────────────────────────────
export const BUCKETS = {
  GENERATED_IMAGES: "generated-images",
  BRAND_ASSETS: "brand-assets",
} as const;

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
