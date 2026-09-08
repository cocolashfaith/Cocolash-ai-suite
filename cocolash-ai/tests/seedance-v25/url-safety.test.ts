/**
 * SSRF guard for every URL that crosses into Enhancor or into a server-side
 * fetch — `isPublicHttpsUrl` in lib/seedance/v25/schema.ts, which is now the
 * ONE implementation (lib/seedance/completion.ts imports it instead of keeping
 * a second, drifting copy).
 *
 * Each case below is a real bypass of the previous version: it accepted
 * obfuscated IPv4 (127.1, 2130706433, 0x7f.0.0.1, 0177.0.0.1), the IPv6
 * unspecified/link-local/ULA ranges, and — worst — IPv4-mapped loopback, whose
 * canonical `URL.hostname` form is `[::ffff:7f00:1]` and never matched the old
 * `::ffff:d.d.d.d` regex.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { isPublicHostname, isPublicHttpsUrl } from "@/lib/seedance/v25/schema";

vi.mock("@/lib/ai/director/seedance-vision-director", () => {
  class VisionDirectorError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = "VisionDirectorError";
    }
  }
  return {
    VisionDirectorError,
    generateSeedanceVisionPrompt: vi.fn(async () => ({
      prompt: "mocked vision prompt",
      diagnostics: { model: "mock", durationMs: 1 },
    })),
  };
});

import { POST as visionPost } from "@/app/api/seedance/director-vision/route";
import { generateSeedanceVisionPrompt } from "@/lib/ai/director/seedance-vision-director";

describe("isPublicHttpsUrl — accepts what the product actually uses", () => {
  it.each([
    "https://cdn.shopify.com/s/files/1/0660/dahlia-915557.jpg",
    "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/x.jpg",
    "https://d2i9jqncnkplwq.cloudfront.net/videos/abc.mp4",
    "https://res.cloudinary.com/demo/video/upload/v1/a.mp4",
    "https://8.8.8.8/image.png", // a genuinely public IP literal
    "https://[2606:4700::6810:85e5]/image.png", // a genuinely public IPv6
  ])("accepts %s", (url) => {
    expect(isPublicHttpsUrl(url)).toBe(true);
  });
});

describe("isPublicHttpsUrl — scheme and name deny-list", () => {
  it.each([
    "http://cdn.shopify.com/a.jpg",
    "file:///etc/passwd",
    "ftp://cdn.example.com/a.jpg",
    "javascript:alert(1)",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isPublicHttpsUrl(url)).toBe(false);
  });

  it.each([
    "https://localhost/a.jpg",
    "https://api.localhost/a.jpg",
    "https://box.local/a.jpg",
    "https://metadata.google.internal/computeMetadata/v1/",
  ])("rejects %s", (url) => {
    expect(isPublicHttpsUrl(url)).toBe(false);
  });
});

describe("isPublicHttpsUrl — obfuscated IPv4 loopback/private forms", () => {
  it.each([
    ["dotted quad loopback", "https://127.0.0.1/a.jpg"],
    ["short form", "https://127.1/a.jpg"],
    ["decimal integer", "https://2130706433/a.jpg"],
    ["hex integer", "https://0x7f000001/a.jpg"],
    ["mixed hex octets", "https://0x7f.0.0.1/a.jpg"],
    ["octal octets", "https://0177.0.0.1/a.jpg"],
    ["octal integer", "https://017700000001/a.jpg"],
    ["private 10/8", "https://10.0.0.5/a.jpg"],
    ["private 172.16/12", "https://172.20.1.1/a.jpg"],
    ["private 192.168/16", "https://192.168.1.1/a.jpg"],
    ["link-local", "https://169.254.169.254/latest/meta-data/"],
    ["this-network", "https://0.0.0.0/a.jpg"],
  ])("rejects %s", (_label, url) => {
    expect(isPublicHttpsUrl(url)).toBe(false);
  });

  it("rejects the same forms when handed a bare hostname", () => {
    for (const host of ["127.1", "2130706433", "0x7f.0.0.1", "0177.0.0.1", "0x7f000001"]) {
      expect(isPublicHostname(host)).toBe(false);
    }
  });

  it("rejects a purely numeric or hex host that is not an address at all", () => {
    expect(isPublicHostname("4294967295")).toBe(false);
    expect(isPublicHostname("0xdeadbeefcafe")).toBe(false);
  });
});

describe("isPublicHttpsUrl — IPv6 literals", () => {
  it.each([
    ["loopback", "https://[::1]/a.jpg"],
    ["unspecified", "https://[::]/a.jpg"],
    ["link-local fe80::/10", "https://[fe80::1]/a.jpg"],
    ["link-local upper half", "https://[febf::1]/a.jpg"],
    ["ULA fc00::/7", "https://[fc00::1]/a.jpg"],
    ["ULA fd00::", "https://[fd12:3456:789a::1]/a.jpg"],
    ["IPv4-mapped loopback", "https://[::ffff:127.0.0.1]/a.jpg"],
    ["IPv4-mapped loopback, hex form", "https://[::ffff:7f00:1]/a.jpg"],
    ["IPv4-mapped loopback, expanded", "https://[0:0:0:0:0:ffff:7f00:1]/a.jpg"],
    ["IPv4-mapped metadata IP", "https://[::ffff:169.254.169.254]/a"],
    ["IPv4-compatible", "https://[::127.0.0.1]/a.jpg"],
    ["multicast", "https://[ff02::1]/a.jpg"],
  ])("rejects %s", (_label, url) => {
    expect(isPublicHttpsUrl(url)).toBe(false);
  });

  it("rejects the bracketed and bare spellings alike", () => {
    expect(isPublicHostname("[::ffff:7f00:1]")).toBe(false);
    expect(isPublicHostname("::ffff:7f00:1")).toBe(false);
    expect(isPublicHostname("fe80::1")).toBe(false);
    expect(isPublicHostname("[fe80::1")).toBe(false); // unterminated
    expect(isPublicHostname("[not:an:address]")).toBe(false);
  });
});

/**
 * The vision director fetches these URLs server-side, so the route must use the
 * SAME guard — `z.string().url()` happily accepted http:// and 127.0.0.1.
 */
describe("POST /api/seedance/director-vision — URL validation", () => {
  const GOOD = "https://cdn.shopify.com/s/files/1/0660/lash.jpg";

  function post(body: unknown): NextRequest {
    return new NextRequest("https://app.example.com/api/seedance/director-vision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      influencerImageUrl: GOOD,
      productImageUrls: [GOOD],
      script: "Try these lashes",
      campaignType: "product-showcase",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts public https image URLs", async () => {
    const response = await visionPost(post(validBody()));
    expect(response.status).toBe(200);
    expect(vi.mocked(generateSeedanceVisionPrompt)).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["http influencer URL", { influencerImageUrl: "http://cdn.shopify.com/a.jpg" }],
    ["loopback influencer URL", { influencerImageUrl: "https://127.0.0.1/a.jpg" }],
    ["metadata product URL", { productImageUrls: ["https://169.254.169.254/latest/"] }],
    ["IPv4-mapped product URL", { productImageUrls: ["https://[::ffff:127.0.0.1]/a"] }],
    [
      "one bad URL among several",
      { influencerImageUrls: [GOOD, "https://10.0.0.1/a.jpg"], influencerImageUrl: undefined },
    ],
  ])("400s on a %s and never calls the vision model", async (_label, overrides) => {
    const response = await visionPost(post(validBody(overrides)));
    expect(response.status).toBe(400);
    expect(vi.mocked(generateSeedanceVisionPrompt)).not.toHaveBeenCalled();
  });
});
