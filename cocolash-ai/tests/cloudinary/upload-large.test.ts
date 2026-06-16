import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Cloudinary durability: large HeyGen clips (1080p/4K) surfaced in prod as a
 * 400 "File size too large". The root cause was the Free-plan account file-size
 * cap, NOT the synchronous 100 MB-per-request limit — Cloudinary fetches remote
 * URLs server-side, so our request never carries the bytes. The fix is the plan
 * upgrade; `uploadVideoFromUrl` keeps handing Cloudinary the URL via `upload()`.
 *
 * This test pins that behavior and guards against regressing to the
 * non-existent `upload_large_stream` (the typings declare it but the runtime
 * package does not export it — it throws "is not a function").
 */

const upload = vi.fn(async (_url: string, _opts: Record<string, unknown>) => ({
  public_id: "cocolash-videos/test",
  secure_url: "https://res.cloudinary.com/x/test.mp4",
  format: "mp4",
  duration: 12,
  width: 1080,
  height: 1920,
  bytes: 150_000_000,
}));

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    // Deliberately NO upload_large_stream — mirrors the real runtime package so
    // a regression to it would throw here exactly as it did in production.
    uploader: { upload },
  },
}));

describe("uploadVideoFromUrl — remote URL upload", () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = "dum01wgok";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    upload.mockClear();
  });
  afterEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });

  it("hands the remote URL to cloudinary.uploader.upload with async eager renders", async () => {
    const { uploadVideoFromUrl } = await import("@/lib/cloudinary/video");
    const result = await uploadVideoFromUrl("https://heygen/x.mp4", {
      title: "t",
      tags: ["cocolash"],
    });

    expect(upload).toHaveBeenCalledTimes(1);
    const [url, opts] = upload.mock.calls[0];
    expect(url).toBe("https://heygen/x.mp4");
    expect(opts.resource_type).toBe("video");
    expect(opts.eager_async).toBe(true);

    expect(result.secureUrl).toBe("https://res.cloudinary.com/x/test.mp4");
    expect(result.bytes).toBe(150_000_000);
  });
});
