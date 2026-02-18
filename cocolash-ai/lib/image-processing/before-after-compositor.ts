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
 * 5x7 bitmap patterns for the limited label alphabet we need.
 * This avoids runtime font dependencies in serverless environments.
 */
const LETTER_PATTERNS: Record<string, string[]> = {
  A: [
    "01110",
    "10001",
    "10001",
    "11111",
    "10001",
    "10001",
    "10001",
  ],
  B: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10001",
    "10001",
    "11110",
  ],
  E: [
    "11111",
    "10000",
    "10000",
    "11110",
    "10000",
    "10000",
    "11111",
  ],
  F: [
    "11111",
    "10000",
    "10000",
    "11110",
    "10000",
    "10000",
    "10000",
  ],
  O: [
    "01110",
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "01110",
  ],
  R: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10100",
    "10010",
    "10001",
  ],
  T: [
    "11111",
    "00100",
    "00100",
    "00100",
    "00100",
    "00100",
    "00100",
  ],
};

function buildBitmapRects(text: string, width: number, height: number): string {
  const colsPerLetter = 5;
  const rows = 7;
  const letterGapCols = 1;

  const totalCols =
    text.length * colsPerLetter + (text.length - 1) * letterGapCols;
  const pixelSize = Math.max(1, Math.floor(Math.min(width / totalCols, height / rows)));

  const textWidthPx = totalCols * pixelSize;
  const textHeightPx = rows * pixelSize;
  const offsetX = Math.floor((width - textWidthPx) / 2);
  const offsetY = Math.floor((height - textHeightPx) / 2);

  let xCursorCols = 0;
  const rects: string[] = [];

  for (const ch of text) {
    const pattern = LETTER_PATTERNS[ch];
    if (!pattern) {
      xCursorCols += colsPerLetter + letterGapCols;
      continue;
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < colsPerLetter; col++) {
        if (pattern[row][col] === "1") {
          const x = offsetX + (xCursorCols + col) * pixelSize;
          const y = offsetY + row * pixelSize;
          rects.push(
            `<rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="#FFFFFF" />`
          );
        }
      }
    }

    xCursorCols += colsPerLetter + letterGapCols;
  }

  return rects.join("");
}

/**
 * Creates a compact label pill as a PNG buffer — fully font-independent.
 */
function createLabelImage(
  label: "BEFORE" | "AFTER",
  pillWidth: number,
  pillHeight: number,
  bgColor: string,
  bgOpacity: number
): Buffer {
  const radius = Math.round(pillHeight * 0.35);
  const bitmapAreaWidth = Math.round(pillWidth * 0.78);
  const bitmapAreaHeight = Math.round(pillHeight * 0.62);
  const bitmapX = Math.floor((pillWidth - bitmapAreaWidth) / 2);
  const bitmapY = Math.floor((pillHeight - bitmapAreaHeight) / 2);
  const bitmapRects = buildBitmapRects(label, bitmapAreaWidth, bitmapAreaHeight);

  const svg =
    `<svg width="${pillWidth}" height="${pillHeight}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0" y="0" width="${pillWidth}" height="${pillHeight}" rx="${radius}" ry="${radius}" fill="${bgColor}" opacity="${bgOpacity}"/>` +
    `<g transform="translate(${bitmapX}, ${bitmapY})">${bitmapRects}</g>` +
    `</svg>`;

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
