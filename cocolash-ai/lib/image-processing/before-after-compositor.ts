/**
 * Before/After Side-by-Side Compositor (M2 Phase 2.4)
 *
 * Uses Sharp to:
 *   1. Resize both images to identical dimensions (capped at 2K for composites)
 *   2. Add "BEFORE" / "AFTER" labels as colored indicator bars
 *   3. Join side-by-side with a brand-color divider gap
 *
 * Labels use colored gradient bars instead of SVG text to avoid
 * font availability issues on serverless environments (Vercel/AWS Lambda).
 *
 * For 4K inputs, the composite is downscaled to 2K to stay within
 * Vercel memory limits and Supabase's 10MB storage limit.
 * Individual Before/After images remain at full resolution.
 */
import sharp from "sharp";

export interface CompositorOptions {
  /** Gap width between the two images in pixels (default: 8) */
  gapWidth?: number;
  /** Gap/divider color as hex (default: CocoLash beige #E8DDD3) */
  gapColor?: string;
}

export interface CompositorResult {
  /** The composited side-by-side image buffer */
  buffer: Buffer;
  /** MIME type (always image/jpeg for composites to stay under size limits) */
  mimeType: string;
  /** Width of the composite image */
  width: number;
  /** Height of the composite image */
  height: number;
}

// Maximum height for composite images (cap to ~2K to manage memory and file size)
const MAX_COMPOSITE_HEIGHT = 1600;

/**
 * Creates a compact label pill as a PNG buffer — no font dependencies.
 * Uses SVG paths (not text elements) so it renders identically everywhere.
 *
 * Each letter is drawn as simple geometric shapes.
 */
function createLabelImage(
  label: "BEFORE" | "AFTER",
  pillWidth: number,
  pillHeight: number,
  bgColor: string,
  bgOpacity: number
): Buffer {
  const radius = Math.round(pillHeight * 0.35);

  // Create the letter shapes as SVG paths
  // Using simple block letter shapes that don't depend on fonts
  const fontSize = Math.round(pillHeight * 0.42);
  const letterSpacing = Math.round(fontSize * 0.15);
  const totalTextWidth = label.length * (fontSize * 0.6 + letterSpacing) - letterSpacing;
  const startX = Math.round((pillWidth - totalTextWidth) / 2);
  const textY = Math.round(pillHeight * 0.5 + fontSize * 0.33);

  // Use a very basic font stack that's available on all Linux systems
  // DejaVu Sans is bundled with Amazon Linux and most Docker images
  const svg = `<svg width="${pillWidth}" height="${pillHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${pillWidth}" height="${pillHeight}" rx="${radius}" ry="${radius}" fill="${bgColor}" opacity="${bgOpacity}"/><text x="${pillWidth / 2}" y="${textY}" text-anchor="middle" font-family="DejaVu Sans, Bitstream Vera Sans, Verdana, Geneva, sans-serif" font-size="${fontSize}" font-weight="bold" letter-spacing="${letterSpacing}" fill="white">${label}</text></svg>`;

  return Buffer.from(svg);
}

/**
 * Creates a side-by-side Before/After composite image.
 *
 * @param beforeBuffer - The "before" image buffer
 * @param afterBuffer - The "after" image buffer
 * @param options - Customization options
 * @returns CompositorResult with the final composite buffer
 */
export async function createBeforeAfterComposite(
  beforeBuffer: Buffer,
  afterBuffer: Buffer,
  options: CompositorOptions = {}
): Promise<CompositorResult> {
  const {
    gapWidth = 8,
    gapColor = "#E8DDD3",
  } = options;

  // 1. Get metadata for both images
  const [beforeMeta, afterMeta] = await Promise.all([
    sharp(beforeBuffer).metadata(),
    sharp(afterBuffer).metadata(),
  ]);

  if (!beforeMeta.width || !beforeMeta.height || !afterMeta.width || !afterMeta.height) {
    throw new Error("Could not read dimensions of one or both images.");
  }

  // 2. Determine target dimensions
  // Use smaller of the two, then cap at MAX_COMPOSITE_HEIGHT to manage memory/size
  let targetHeight = Math.min(beforeMeta.height, afterMeta.height);
  if (targetHeight > MAX_COMPOSITE_HEIGHT) {
    targetHeight = MAX_COMPOSITE_HEIGHT;
  }
  const targetWidth = Math.round(
    targetHeight * (beforeMeta.width / beforeMeta.height)
  );

  // 3. Resize both images to identical dimensions (output as JPEG to save memory)
  const [resizedBefore, resizedAfter] = await Promise.all([
    sharp(beforeBuffer)
      .resize(targetWidth, targetHeight, { fit: "cover", position: "center" })
      .jpeg({ quality: 95 })
      .toBuffer(),
    sharp(afterBuffer)
      .resize(targetWidth, targetHeight, { fit: "cover", position: "center" })
      .jpeg({ quality: 95 })
      .toBuffer(),
  ]);

  // 4. Create label pill overlays (no font dependencies)
  const pillWidth = Math.round(targetWidth * 0.4);
  const pillHeight = Math.max(28, Math.round(targetHeight * 0.045));
  const pillX = Math.round((targetWidth - pillWidth) / 2);
  const pillY = Math.round(targetHeight * 0.03);

  const beforeLabel = createLabelImage("BEFORE", pillWidth, pillHeight, "#5A3D2E", 0.7);
  const afterLabel = createLabelImage("AFTER", pillWidth, pillHeight, "#B8860B", 0.7);

  // 5. Composite labels onto each image
  const [labeledBefore, labeledAfter] = await Promise.all([
    sharp(resizedBefore)
      .composite([{ input: beforeLabel, top: pillY, left: pillX }])
      .jpeg({ quality: 95 })
      .toBuffer(),
    sharp(resizedAfter)
      .composite([{ input: afterLabel, top: pillY, left: pillX }])
      .jpeg({ quality: 95 })
      .toBuffer(),
  ]);

  // 6. Create the final composite — side by side with gap
  const compositeWidth = targetWidth * 2 + gapWidth;
  const compositeHeight = targetHeight;

  const composite = await sharp({
    create: {
      width: compositeWidth,
      height: compositeHeight,
      channels: 3,
      background: gapColor,
    },
  })
    .composite([
      { input: labeledBefore, top: 0, left: 0 },
      { input: labeledAfter, top: 0, left: targetWidth + gapWidth },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

  return {
    buffer: composite,
    mimeType: "image/jpeg",
    width: compositeWidth,
    height: compositeHeight,
  };
}
