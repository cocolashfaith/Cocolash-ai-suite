/**
 * Before/After Side-by-Side Compositor (M2 Phase 2.4)
 *
 * Uses Sharp to:
 *   1. Resize both images to identical dimensions
 *   2. Add "BEFORE" / "AFTER" text labels via SVG overlay
 *   3. Join side-by-side with a brand-color divider gap
 *
 * This is a pure image-processing step — no Gemini calls.
 * Takes milliseconds compared to the generation step.
 */
import sharp from "sharp";

export interface CompositorOptions {
  /** Gap width between the two images in pixels (default: 8) */
  gapWidth?: number;
  /** Gap/divider color as hex (default: CocoLash beige #E8DDD3) */
  gapColor?: string;
  /** Label font size in pixels (default: auto-calculated based on image size) */
  labelFontSize?: number;
  /** Label text color as hex (default: white) */
  labelColor?: string;
  /** Label background opacity 0-1 (default: 0.55) */
  labelBgOpacity?: number;
}

export interface CompositorResult {
  /** The composited side-by-side image buffer */
  buffer: Buffer;
  /** MIME type (always image/png) */
  mimeType: string;
  /** Width of the composite image */
  width: number;
  /** Height of the composite image */
  height: number;
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
    labelColor = "#FFFFFF",
    labelBgOpacity = 0.55,
  } = options;

  // 1. Get metadata for both images
  const [beforeMeta, afterMeta] = await Promise.all([
    sharp(beforeBuffer).metadata(),
    sharp(afterBuffer).metadata(),
  ]);

  if (!beforeMeta.width || !beforeMeta.height || !afterMeta.width || !afterMeta.height) {
    throw new Error("Could not read dimensions of one or both images.");
  }

  // 2. Determine target dimensions — use the smaller of the two for consistency
  const targetHeight = Math.min(beforeMeta.height, afterMeta.height);
  const targetWidth = Math.round(
    targetHeight * (beforeMeta.width / beforeMeta.height)
  );

  // Auto-calculate label font size based on image height
  const labelFontSize = options.labelFontSize || Math.max(24, Math.round(targetHeight * 0.035));

  // 3. Resize both images to identical dimensions
  const [resizedBefore, resizedAfter] = await Promise.all([
    sharp(beforeBuffer)
      .resize(targetWidth, targetHeight, { fit: "cover", position: "center" })
      .png()
      .toBuffer(),
    sharp(afterBuffer)
      .resize(targetWidth, targetHeight, { fit: "cover", position: "center" })
      .png()
      .toBuffer(),
  ]);

  // 4. Create SVG label overlays
  const labelPadH = Math.round(labelFontSize * 1.2);
  const labelPadV = Math.round(labelFontSize * 0.5);
  const labelHeight = labelFontSize + labelPadV * 2;
  const labelY = Math.round(targetHeight * 0.04); // 4% from top

  const createLabelSVG = (text: string, accentColor: string, width: number) => {
    const textWidth = text.length * labelFontSize * 0.65;
    const bgWidth = textWidth + labelPadH * 2;
    const bgX = Math.round((width - bgWidth) / 2);

    return Buffer.from(`
      <svg width="${width}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${bgX}" y="${labelY}" width="${bgWidth}" height="${labelHeight}"
              rx="${Math.round(labelHeight * 0.3)}" ry="${Math.round(labelHeight * 0.3)}"
              fill="${accentColor}" opacity="${labelBgOpacity}" />
        <text x="${width / 2}" y="${labelY + labelHeight / 2 + labelFontSize * 0.35}"
              text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
              font-size="${labelFontSize}" font-weight="700" letter-spacing="2"
              fill="${labelColor}">${text}</text>
      </svg>
    `);
  };

  const beforeLabelSVG = createLabelSVG("BEFORE", "#6B5B4E", targetWidth);
  const afterLabelSVG = createLabelSVG("AFTER", "#B8860B", targetWidth);

  // 5. Composite labels onto each image
  const [labeledBefore, labeledAfter] = await Promise.all([
    sharp(resizedBefore)
      .composite([{ input: beforeLabelSVG, top: 0, left: 0 }])
      .png()
      .toBuffer(),
    sharp(resizedAfter)
      .composite([{ input: afterLabelSVG, top: 0, left: 0 }])
      .png()
      .toBuffer(),
  ]);

  // 6. Create the final composite — side by side with gap
  const compositeWidth = targetWidth * 2 + gapWidth;
  const compositeHeight = targetHeight;

  // Create a background canvas with the gap color
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
    .png({ quality: 95 })
    .toBuffer();

  return {
    buffer: composite,
    mimeType: "image/png",
    width: compositeWidth,
    height: compositeHeight,
  };
}
