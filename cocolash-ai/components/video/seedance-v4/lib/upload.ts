/**
 * Shared client-side uploader for the v4 Seedance wizard.
 *
 * Uses path prefixes that the `brand-assets` bucket already permits via the
 * existing legacy flows (so we don't need a migration to add new policies):
 *   - audio/   — used by SeedanceAvatarStep for lip-sync audio (verified)
 *   - products/ — used by uploadProductImage / SeedanceAvatarStep (verified)
 *
 * If a future migration adds a dedicated `seedance-v4/` prefix policy, this
 * helper is the only place to change.
 */

import { createClient } from "@/lib/supabase/client";

export interface UploadResult {
  url: string;
  path: string;
}

const BUCKET = "brand-assets";

export async function uploadSeedanceMedia(
  file: File,
  kind: "audio" | "image" | "video"
): Promise<UploadResult> {
  if (file.size > 50 * 1024 * 1024) {
    throw new Error("File must be under 50 MB");
  }

  const supabase = createClient();
  const ext = file.name.split(".").pop() || (kind === "audio" ? "mp3" : "png");
  // Use the known-working path prefixes — `audio/` and `products/` already
  // work for the legacy SeedanceAvatarStep upload flow.
  const prefix = kind === "audio" ? "audio" : "products";
  const filename = `${prefix}/v4-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, {
      contentType: file.type || (kind === "audio" ? "audio/mpeg" : "image/png"),
      cacheControl: "3600",
    });
  if (error) {
    throw new Error(error.message || "Upload failed");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  return { url: publicUrl, path: filename };
}
