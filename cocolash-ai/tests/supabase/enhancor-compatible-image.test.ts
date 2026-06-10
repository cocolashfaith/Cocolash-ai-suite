/**
 * Enhancor only accepts PNG/JPEG. toEnhancorCompatibleImage must pass those
 * through and transcode everything else (notably WebP) to PNG, so uploaded
 * product/influencer references never get rejected at generation time.
 */

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { toEnhancorCompatibleImage } from "@/lib/image-processing/enhancor-image";

async function solidFile(
  format: "png" | "jpeg" | "webp",
  name: string,
  mime: string
): Promise<File> {
  const base = sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  });
  const buf =
    format === "png"
      ? await base.png().toBuffer()
      : format === "jpeg"
        ? await base.jpeg().toBuffer()
        : await base.webp().toBuffer();
  return new File([new Uint8Array(buf)], name, { type: mime });
}

describe("toEnhancorCompatibleImage", () => {
  it("passes a PNG through unchanged", async () => {
    const out = await toEnhancorCompatibleImage(
      await solidFile("png", "p.png", "image/png")
    );
    expect(out.type).toBe("image/png");
  });

  it("passes a JPEG through unchanged", async () => {
    const out = await toEnhancorCompatibleImage(
      await solidFile("jpeg", "p.jpg", "image/jpeg")
    );
    expect(out.type).toBe("image/jpeg");
  });

  it("transcodes WebP to PNG (the bug that broke generation)", async () => {
    const out = await toEnhancorCompatibleImage(
      await solidFile("webp", "p.webp", "image/webp")
    );
    expect(out.type).toBe("image/png");
    expect(out.name).toMatch(/\.png$/);
    const meta = await sharp(
      Buffer.from(await out.arrayBuffer())
    ).metadata();
    expect(meta.format).toBe("png");
  });
});
