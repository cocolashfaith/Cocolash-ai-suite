import { describe, it, expect } from "vitest";
import nextConfig from "@/next.config";

/**
 * Regression guard for the live gallery crash:
 *
 *   Invalid src prop (https://d2i9jqncnkplwq.cloudfront.net/thumbnails/...webp)
 *   on `next/image`, hostname "d2i9jqncnkplwq.cloudfront.net" is not configured
 *   under images in your `next.config.js`
 *
 * next/image throws synchronously during render for any host not listed in
 * images.remotePatterns, which white-screens the page. Finished Seedance videos
 * (and their thumbnails) are served from Enhancor CloudFront distributions, and
 * completion falls back to those URLs when Cloudinary re-hosting is unavailable.
 *
 * If any of these hosts is dropped from the config, the corresponding pipeline's
 * thumbnails would crash the gallery again. This test keeps them present.
 */
describe("next.config image remotePatterns — required hosts", () => {
  const patterns = nextConfig.images?.remotePatterns ?? [];
  const hostnames = patterns.map((p) => p.hostname);

  it("has at least one remote pattern configured", () => {
    expect(patterns.length).toBeGreaterThan(0);
  });

  it("whitelists Enhancor/Seedance CloudFront output (the regression)", () => {
    expect(hostnames).toContain("**.cloudfront.net");
  });

  it("whitelists Cloudinary (re-hosted videos + thumbnails)", () => {
    expect(hostnames).toContain("res.cloudinary.com");
  });

  it("whitelists HeyGen CDN subdomains", () => {
    expect(hostnames).toContain("**.heygen.ai");
  });

  it("whitelists a Supabase storage host", () => {
    expect(
      hostnames.some((h) => typeof h === "string" && h.includes("supabase"))
    ).toBe(true);
  });

  it("every pattern uses https (no plaintext image hosts)", () => {
    for (const p of patterns) {
      expect(p.protocol).toBe("https");
    }
  });
});
