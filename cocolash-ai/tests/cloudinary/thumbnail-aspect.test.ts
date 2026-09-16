import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * F14 — aspect-correct thumbnails.
 *
 * The thumbnail transformation used to be hardcoded to 640x360 with
 * `crop: "fill"`, so every 9:16 clip (the default aspect for the whole UGC
 * wizard) was centre-cropped into a landscape strip: the influencer's face and
 * the product both fell outside the card. The box now comes from the video's
 * real aspect, with the long edge pinned at 640 px and the old 640x360 kept as
 * the fallback for an unknown aspect.
 */

const url = vi.fn(
  (publicId: string, _opts: Record<string, unknown>) =>
    `https://res.cloudinary.com/x/${publicId}.jpg`
);

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    url,
    uploader: { upload: vi.fn(), upload_stream: vi.fn(), destroy: vi.fn() },
  },
}));

type Transform = Record<string, unknown>;

function lastTransform(): Transform {
  const opts = url.mock.calls[url.mock.calls.length - 1][1] as {
    transformation: Transform[];
  };
  return opts.transformation[0];
}

describe("thumbnail dimensions derive from the video aspect", () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = "dum01wgok";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    url.mockClear();
  });
  afterEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });

  it("gives a 9:16 video a portrait 360x640 box (from pixel dimensions)", async () => {
    const { thumbnailDimensions } = await import("@/lib/cloudinary/video");
    expect(thumbnailDimensions({ width: 1080, height: 1920 })).toEqual({
      width: 360,
      height: 640,
    });
  });

  it("gives a 9:16 video a portrait 360x640 box (from the aspect string)", async () => {
    const { thumbnailDimensions } = await import("@/lib/cloudinary/video");
    expect(thumbnailDimensions({ aspectRatio: "9:16" })).toEqual({
      width: 360,
      height: 640,
    });
  });

  it("keeps 16:9 at the historical 640x360", async () => {
    const { thumbnailDimensions } = await import("@/lib/cloudinary/video");
    expect(thumbnailDimensions({ width: 1920, height: 1080 })).toEqual({
      width: 640,
      height: 360,
    });
    expect(thumbnailDimensions({ aspectRatio: "16:9" })).toEqual({
      width: 640,
      height: 360,
    });
  });

  it("gives a square video a 640x640 box", async () => {
    const { thumbnailDimensions } = await import("@/lib/cloudinary/video");
    expect(thumbnailDimensions({ aspectRatio: "1:1" })).toEqual({
      width: 640,
      height: 640,
    });
  });

  it("falls back to 640x360 when the aspect is unknown or unusable", async () => {
    const { thumbnailDimensions } = await import("@/lib/cloudinary/video");
    const fallback = { width: 640, height: 360 };

    expect(thumbnailDimensions()).toEqual(fallback);
    expect(thumbnailDimensions({})).toEqual(fallback);
    expect(thumbnailDimensions({ width: 0, height: 0 })).toEqual(fallback);
    expect(thumbnailDimensions({ width: null, height: null })).toEqual(fallback);
    expect(thumbnailDimensions({ aspectRatio: "portrait" })).toEqual(fallback);
    expect(thumbnailDimensions({ aspectRatio: "9:0" })).toEqual(fallback);
  });

  it("prefers pixel dimensions over a contradicting aspect string", async () => {
    const { thumbnailDimensions } = await import("@/lib/cloudinary/video");
    expect(
      thumbnailDimensions({ width: 1080, height: 1920, aspectRatio: "16:9" })
    ).toEqual({ width: 360, height: 640 });
  });
});

describe("getThumbnailUrl", () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = "dum01wgok";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    url.mockClear();
  });
  afterEach(() => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });

  it("builds a portrait transformation for a 9:16 source", async () => {
    const { getThumbnailUrl } = await import("@/lib/cloudinary/video");
    getThumbnailUrl("cocolash-videos/clip", {
      aspect: { width: 1080, height: 1920 },
    });

    const t = lastTransform();
    expect(t.width).toBe(360);
    expect(t.height).toBe(640);
    expect(t.crop).toBe("fill");
    expect(t.start_offset).toBe("0");
  });

  it("keeps the 640x360 default when no aspect is supplied", async () => {
    const { getThumbnailUrl } = await import("@/lib/cloudinary/video");
    getThumbnailUrl("cocolash-videos/clip");

    const t = lastTransform();
    expect(t.width).toBe(640);
    expect(t.height).toBe(360);
  });

  it("lets an explicit width/height override the derived box", async () => {
    const { getThumbnailUrl } = await import("@/lib/cloudinary/video");
    getThumbnailUrl("cocolash-videos/clip", {
      aspect: { aspectRatio: "9:16" },
      width: 200,
      height: 200,
    });

    const t = lastTransform();
    expect(t.width).toBe(200);
    expect(t.height).toBe(200);
  });

  it("carries the aspect into every timestamped option", async () => {
    const { getThumbnailOptions } = await import("@/lib/cloudinary/video");
    const options = getThumbnailOptions("cocolash-videos/clip", 8, 3, {
      aspectRatio: "9:16",
    });

    expect(options).toHaveLength(3);
    const transforms = url.mock.calls.map(
      (call) => (call[1] as { transformation: Transform[] }).transformation[0]
    );
    expect(transforms).toHaveLength(3);
    for (const t of transforms) {
      expect(t.width).toBe(360);
      expect(t.height).toBe(640);
    }
    expect(transforms.map((t) => t.start_offset)).toEqual(["2", "4", "6"]);
  });
});
