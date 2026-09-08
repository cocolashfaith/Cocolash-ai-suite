/**
 * Enhancor-compatible image normalisation.
 *
 * Enhancor's Seedance API only accepts PNG and JPEG (it rejects WebP/AVIF/GIF/
 * HEIC with a 400). Any image that becomes a Seedance reference (products[] or
 * influencers[]) must therefore be PNG/JPEG.
 *
 * This is the single choke point for every image byte that reaches the public
 * `video-inputs` bucket, so it is also where the content type is DECIDED rather
 * than believed:
 *
 *   - The declared MIME is attacker-controlled (it is just a multipart header).
 *     A file declared `image/png` whose bytes are an SVG, an HTML document or a
 *     PHP script would otherwise be stored verbatim on a public CDN origin and
 *     served back with `Content-Type: image/png` — one CDN/browser sniffing
 *     quirk away from stored XSS. We therefore sniff the magic bytes and only
 *     ever pass a file through untouched when the bytes agree with the label.
 *   - Anything else is re-encoded by sharp (which fails loudly on a non-image),
 *     so what lands in storage is always a real raster we produced.
 *
 * Lives in lib/image-processing/ (alongside the other `sharp` users) so the
 * native binding stays out of the widely-imported lib/supabase/storage.ts —
 * importing sharp there breaks the Turbopack build.
 */

import sharp from "sharp";

/** Thrown when the bytes are not a decodable image; the route answers 400. */
export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

export type SniffedImageFormat = "png" | "jpeg" | "webp" | null;

/**
 * Identify an image by its magic bytes:
 *   PNG   89 50 4E 47 0D 0A 1A 0A
 *   JPEG  FF D8 FF
 *   WebP  "RIFF" .... "WEBP"
 * Returns null for everything else (including SVG/HTML/AVIF/GIF/HEIC).
 */
export function sniffImageFormat(bytes: Uint8Array): SniffedImageFormat {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "webp";
  }
  return null;
}

/** ~50 MP decode cap + reject truncated/corrupt input rather than guessing. */
const SHARP_OPTIONS = { limitInputPixels: 50_000_000, failOn: "warning" } as const;

/** Enhancor never needs more than 4K on the long edge. */
const MAX_EDGE = 4096;

/** Re-encode arbitrary bytes to a bounded PNG, or fail with a 400-able error. */
async function transcodeToPng(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, SHARP_OPTIONS)
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new UnsupportedImageError(
      `That file is not a readable PNG, JPEG or WebP image (${detail}).`
    );
  }
}

/**
 * Normalise an uploaded image to a Seedance-accepted format. A file whose magic
 * bytes really are PNG/JPEG passes through untouched (and is relabelled to the
 * format the BYTES say, not the one the client claimed); everything else —
 * WebP, AVIF, GIF, HEIC, and any mislabelled non-image — is transcoded to PNG
 * by sharp or rejected. Returns a `File` so the storage upload helpers keep
 * their name/ext/type logic.
 */
export async function toEnhancorCompatibleImage(file: File | Blob): Promise<File> {
  const baseName =
    file instanceof File ? file.name.replace(/\.[^.]+$/, "") : "upload";

  const input = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageFormat(input);

  // Bytes agree with a format Enhancor accepts → store verbatim, labelled by
  // the bytes. (A `.png` upload that is really a JPEG becomes image/jpeg.)
  if (sniffed === "png") {
    return new File([new Uint8Array(input)], `${baseName}.png`, { type: "image/png" });
  }
  if (sniffed === "jpeg") {
    return new File([new Uint8Array(input)], `${baseName}.jpg`, { type: "image/jpeg" });
  }

  // WebP (Enhancor rejects it) and anything unrecognised — including a file
  // that merely CLAIMED to be PNG/JPEG — go through sharp.
  const png = await transcodeToPng(input);
  return new File([new Uint8Array(png)], `${baseName}.png`, { type: "image/png" });
}
