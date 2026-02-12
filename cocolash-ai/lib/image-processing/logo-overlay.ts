/**
 * Logo Overlay Processing
 *
 * Downloads the brand logo from Supabase Storage and composites it
 * onto the generated image at the specified position using Sharp.
 */
import sharp from "sharp";
import type { LogoOverlaySettings, LogoVariant } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────
export interface LogoOverlayOptions extends LogoOverlaySettings {
  /** URL of the logo image in Supabase Storage */
  logoUrl: string;
}

export interface OverlayResult {
  /** Final image buffer with logo composited */
  buffer: Buffer;
  /** MIME type of the output image */
  mimeType: string;
}

// ── Logo Cache ───────────────────────────────────────────────
/**
 * Simple in-memory cache for downloaded logo buffers.
 * Logos rarely change, so caching avoids re-downloading per generation.
 */
const logoCache = new Map<string, { buffer: Buffer; fetchedAt: number }>();
const LOGO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchLogoBuffer(url: string): Promise<Buffer> {
  // Check cache first
  const cached = logoCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < LOGO_CACHE_TTL_MS) {
    return cached.buffer;
  }

  // Strip cache-buster query params for fetching
  const cleanUrl = url.split("?")[0];

  const response = await fetch(cleanUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download logo from ${cleanUrl}: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Cache the downloaded buffer
  logoCache.set(url, { buffer, fetchedAt: Date.now() });

  return buffer;
}

// ── Position Calculator ──────────────────────────────────────
function calculatePosition(
  imageWidth: number,
  imageHeight: number,
  logoWidth: number,
  logoHeight: number,
  position: LogoOverlaySettings["position"],
  paddingPercent: number
): { left: number; top: number } {
  const paddingX = Math.round(imageWidth * (paddingPercent / 100));
  const paddingY = Math.round(imageHeight * (paddingPercent / 100));

  switch (position) {
    case "top-left":
      return { left: paddingX, top: paddingY };
    case "top-right":
      return { left: imageWidth - logoWidth - paddingX, top: paddingY };
    case "bottom-left":
      return { left: paddingX, top: imageHeight - logoHeight - paddingY };
    case "bottom-right":
      return {
        left: imageWidth - logoWidth - paddingX,
        top: imageHeight - logoHeight - paddingY,
      };
    case "center":
      return {
        left: Math.round((imageWidth - logoWidth) / 2),
        top: Math.round((imageHeight - logoHeight) / 2),
      };
    default:
      // Default to bottom-right
      return {
        left: imageWidth - logoWidth - paddingX,
        top: imageHeight - logoHeight - paddingY,
      };
  }
}

// ── Main Overlay Function ────────────────────────────────────
/**
 * Applies a logo overlay to the generated image.
 *
 * @param imageBuffer - The raw generated image buffer
 * @param options - Logo overlay settings including URL, position, opacity, etc.
 * @returns OverlayResult with the composited image buffer
 */
export async function applyLogoOverlay(
  imageBuffer: Buffer,
  options: LogoOverlayOptions
): Promise<OverlayResult> {
  const {
    logoUrl,
    position = "bottom-right",
    opacity = 0.9,
    paddingPercent = 3,
    sizePercent = 22,
  } = options;

  // 1. Get the base image metadata
  const baseImage = sharp(imageBuffer);
  const metadata = await baseImage.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions.");
  }

  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  // 2. Download and process the logo
  const logoBuffer = await fetchLogoBuffer(logoUrl);

  // Calculate logo size as percentage of image width
  const targetLogoWidth = Math.round(imageWidth * (sizePercent / 100));

  // Resize logo maintaining aspect ratio
  const resizedLogo = await sharp(logoBuffer)
    .resize(targetLogoWidth, null, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .ensureAlpha() // Ensure logo has alpha channel
    .toBuffer();

  // Get resized logo dimensions
  const logoMeta = await sharp(resizedLogo).metadata();
  const logoWidth = logoMeta.width || targetLogoWidth;
  const logoHeight = logoMeta.height || targetLogoWidth;

  // 3. Apply opacity to the logo
  let processedLogo: Buffer;
  if (opacity < 1) {
    // Multiply the alpha channel by opacity
    processedLogo = await sharp(resizedLogo)
      .ensureAlpha()
      .composite([
        {
          input: Buffer.from([
            0, 0, 0, Math.round(opacity * 255),
          ]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      .toBuffer();
  } else {
    processedLogo = resizedLogo;
  }

  // 4. Calculate position
  const { left, top } = calculatePosition(
    imageWidth,
    imageHeight,
    logoWidth,
    logoHeight,
    position,
    paddingPercent
  );

  // 5. Composite logo onto base image
  const result = await sharp(imageBuffer)
    .composite([
      {
        input: processedLogo,
        left: Math.max(0, left),
        top: Math.max(0, top),
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  return {
    buffer: result,
    mimeType: "image/png",
  };
}

// ── Helper: Select Logo URL by Variant ───────────────────────
/**
 * Selects the appropriate logo URL from the brand profile based on variant.
 * Falls back to any available logo if the preferred variant isn't uploaded.
 */
export function selectLogoUrl(
  variant: LogoVariant,
  logos: {
    logo_white_url: string | null;
    logo_dark_url: string | null;
    logo_gold_url: string | null;
  }
): string | null {
  const variantMap: Record<LogoVariant, string | null> = {
    white: logos.logo_white_url,
    dark: logos.logo_dark_url,
    gold: logos.logo_gold_url,
  };

  // Try preferred variant first
  if (variantMap[variant]) return variantMap[variant];

  // Fall back to any available logo
  return logos.logo_white_url || logos.logo_dark_url || logos.logo_gold_url;
}
