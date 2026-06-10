/**
 * Enhancor-compatible image normalisation.
 *
 * Enhancor's Seedance API only accepts PNG and JPEG (it rejects WebP/AVIF/GIF/
 * HEIC with a 400). Any image that becomes a Seedance reference (products[] or
 * influencers[]) must therefore be PNG/JPEG.
 *
 * Lives in lib/image-processing/ (alongside the other `sharp` users) so the
 * native binding stays out of the widely-imported lib/supabase/storage.ts —
 * importing sharp there breaks the Turbopack build.
 */

import sharp from "sharp";

/**
 * Normalise an uploaded image to a Seedance-accepted format: PNG/JPEG pass
 * through untouched; everything else is transcoded to PNG. Returns a `File`
 * so the storage upload helpers keep their name/ext/type logic.
 */
export async function toEnhancorCompatibleImage(
  file: File | Blob
): Promise<File> {
  const type = file.type || "";
  const baseName =
    file instanceof File ? file.name.replace(/\.[^.]+$/, "") : "upload";

  if (type === "image/png") {
    return file instanceof File
      ? file
      : new File([file], `${baseName}.png`, { type: "image/png" });
  }
  if (type === "image/jpeg") {
    return file instanceof File
      ? file
      : new File([file], `${baseName}.jpg`, { type: "image/jpeg" });
  }

  // Transcode anything else (webp, avif, gif, heic, …) to PNG.
  const input = Buffer.from(await file.arrayBuffer());
  const png = await sharp(input).png().toBuffer();
  return new File([new Uint8Array(png)], `${baseName}.png`, {
    type: "image/png",
  });
}
