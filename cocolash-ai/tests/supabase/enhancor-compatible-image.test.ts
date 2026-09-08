/**
 * Enhancor only accepts PNG/JPEG. toEnhancorCompatibleImage must pass those
 * through and transcode everything else (notably WebP) to PNG, so uploaded
 * product/influencer references never get rejected at generation time.
 */

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  UnsupportedImageError,
  sniffImageFormat,
  toEnhancorCompatibleImage,
} from "@/lib/image-processing/enhancor-image";

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

/**
 * The declared MIME is an attacker-controlled multipart header. These bytes
 * land on a PUBLIC storage origin, so what is stored must be decided by the
 * magic bytes — never by the label.
 */
describe("magic-byte sniffing", () => {
  it("identifies PNG, JPEG and WebP by their signatures", async () => {
    const png = new Uint8Array(await (await solidFile("png", "a.png", "image/png")).arrayBuffer());
    const jpeg = new Uint8Array(await (await solidFile("jpeg", "a.jpg", "image/jpeg")).arrayBuffer());
    const webp = new Uint8Array(await (await solidFile("webp", "a.webp", "image/webp")).arrayBuffer());

    expect(sniffImageFormat(png)).toBe("png");
    expect(sniffImageFormat(jpeg)).toBe("jpeg");
    expect(sniffImageFormat(webp)).toBe("webp");
    expect(png.slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(jpeg.slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it("returns null for non-images and short buffers", () => {
    expect(sniffImageFormat(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageFormat(new TextEncoder().encode("<!doctype html><script>"))).toBeNull();
    expect(sniffImageFormat(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageFormat(new Uint8Array())).toBeNull();
  });

  it("rejects a 'PNG' whose bytes are HTML instead of storing it as-is", async () => {
    const evil = new File(
      [new TextEncoder().encode("<!doctype html><script>alert(1)</script>")],
      "evil.png",
      { type: "image/png" }
    );
    await expect(toEnhancorCompatibleImage(evil)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("rejects a 'JPEG' whose bytes are an SVG", async () => {
    const evil = new File(
      [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
      "evil.jpg",
      { type: "image/jpeg" }
    );
    await expect(toEnhancorCompatibleImage(evil)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("re-encodes a WebP that merely CLAIMS to be a PNG", async () => {
    const webp = await solidFile("webp", "lie.png", "image/png");
    const out = await toEnhancorCompatibleImage(webp);

    expect(out.type).toBe("image/png");
    const meta = await sharp(Buffer.from(await out.arrayBuffer())).metadata();
    expect(meta.format).toBe("png"); // really transcoded, not passed through
  });

  it("labels a file by its BYTES, not by the extension it was given", async () => {
    const jpeg = await solidFile("jpeg", "mislabelled.png", "image/png");
    const out = await toEnhancorCompatibleImage(jpeg);

    expect(out.type).toBe("image/jpeg");
    expect(out.name).toMatch(/\.jpg$/);
  });

  it("bounds a transcoded image to 4096px on the long edge", async () => {
    const wide = await sharp({
      create: { width: 6000, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .webp()
      .toBuffer();
    const out = await toEnhancorCompatibleImage(
      new File([new Uint8Array(wide)], "wide.webp", { type: "image/webp" })
    );

    const meta = await sharp(Buffer.from(await out.arrayBuffer())).metadata();
    expect(meta.width).toBe(4096);
    expect(meta.height).toBe(68);
  });
});
