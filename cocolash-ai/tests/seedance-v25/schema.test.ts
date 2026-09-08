import { describe, it, expect } from "vitest";
import {
  DurationSchema,
  RerenderBodySchema,
  Seedance25CallbackSchema,
  Seedance25GenerateBodySchema,
  Seedance25RequestSchema,
  extractInputUrls,
  formatZodIssues,
  hasVideoInputs,
  isPublicHttpsUrl,
  isSeedance25GenerateBody,
  normalizeSeedance25Status,
  parseSeedance25Callback,
  resolveQualityTier,
} from "@/lib/seedance/v25/schema";
import { AUTO_DURATION } from "@/lib/seedance/v25/types";

const IMG = "https://cdn.shopify.com/s/files/1/0660/8646/9831/files/dahlia-915557.jpg?v=1768316695";
const IMG2 =
  "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/generated-images/cocolash/a-studio-avatar.jpg";
const VID = "https://d2i9jqncnkplwq.cloudfront.net/videos/abc.mp4";
const AUD = "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/video-inputs/audio/x.mp3";

function fail(input: unknown): string {
  const r = Seedance25RequestSchema.safeParse(input);
  if (r.success) throw new Error("expected failure, got " + JSON.stringify(r.data));
  return formatZodIssues(r.error);
}

function ok(input: unknown) {
  const r = Seedance25RequestSchema.safeParse(input);
  if (!r.success) throw new Error("expected success: " + formatZodIssues(r.error));
  return r.data;
}

describe("Seedance25RequestSchema — universal rules", () => {
  it("parses the proven POC UGC payload and applies defaults", () => {
    const req = ok({
      mode: "ugc",
      prompt: "The influencer holds the product and smiles at the camera",
      duration: "8",
      resolution: "720p",
      aspect_ratio: "9:16",
      pass_faces: true,
      products: [IMG],
      influencers: [IMG2],
    });
    expect(req).toEqual({
      mode: "ugc",
      prompt: "The influencer holds the product and smiles at the camera",
      duration: 8,
      resolution: "720p",
      aspect_ratio: "9:16",
      products: [IMG],
      influencers: [IMG2],
      pass_faces: true,
      is_uncensored: false,
      output_format: "mp4",
      bitrate_mode: "standard",
    });
  });

  it("defaults: 720p, 9:16, 8 s, pass_faces on, is_uncensored off, mp4, standard bitrate", () => {
    const req = ok({ mode: "text_to_video", prompt: "a lash tutorial" });
    expect(req.resolution).toBe("720p");
    expect(req.aspect_ratio).toBe("9:16");
    expect(req.duration).toBe(8);
    expect(req.pass_faces).toBe(true);
    expect(req.is_uncensored).toBe(false);
    expect(req.output_format).toBe("mp4");
    expect(req.bitrate_mode).toBe("standard");
  });

  it("strips unknown keys (webhook_url, type, full_access, fast_mode never pass through)", () => {
    const req = ok({
      mode: "text_to_video",
      prompt: "x",
      webhook_url: "https://evil.example/hook",
      type: "text-to-video",
      full_access: true,
      fast_mode: true,
      quality: "high",
    });
    expect(req).not.toHaveProperty("webhook_url");
    expect(req).not.toHaveProperty("type");
    expect(req).not.toHaveProperty("full_access");
    expect(req).not.toHaveProperty("fast_mode");
    expect(req).not.toHaveProperty("quality");
  });

  it("duration accepts 4–30 or -1, as number or numeric string; rejects 3, 31, 0, 7.5", () => {
    expect(DurationSchema.parse("30")).toBe(30);
    expect(DurationSchema.parse(4)).toBe(4);
    expect(DurationSchema.parse(-1)).toBe(-1);
    expect(DurationSchema.parse("-1")).toBe(-1);
    expect(DurationSchema.safeParse(3).success).toBe(false);
    expect(DurationSchema.safeParse(31).success).toBe(false);
    expect(DurationSchema.safeParse(0).success).toBe(false);
    expect(DurationSchema.safeParse(7.5).success).toBe(false);
    expect(DurationSchema.safeParse("abc").success).toBe(false);
    expect(fail({ mode: "text_to_video", prompt: "x", duration: 45 })).toMatch(/duration/);
  });

  it("prompt is required for every mode except multi_frame", () => {
    for (const mode of ["ugc", "text_to_video", "multi_reference", "first_n_last_frames", "edit", "extend", "lipsyncing", "voice_clone"]) {
      expect(fail({ mode }), mode).toMatch(/prompt is required/);
    }
  });

  it("enforces media limits: images ≤ 30, videos ≤ 10, audios ≤ 10", () => {
    const many = (n: number, u = IMG) => Array.from({ length: n }, () => u);
    expect(fail({ mode: "multi_reference", prompt: "p", images: many(31) })).toMatch(/images/);
    expect(ok({ mode: "multi_reference", prompt: "p", images: many(30) }).images).toHaveLength(30);
    expect(fail({ mode: "multi_reference", prompt: "p", videos: many(11, VID) })).toMatch(/videos/);
    expect(fail({ mode: "multi_reference", prompt: "p", audios: many(11, AUD) })).toMatch(/audios/);
  });

  it("rejects non-public / non-https media URLs (SSRF guard)", () => {
    expect(fail({ mode: "multi_reference", prompt: "p", images: ["http://example.com/a.jpg"] })).toMatch(/https/);
    expect(fail({ mode: "multi_reference", prompt: "p", images: ["https://localhost/a.jpg"] })).toMatch(/https/);
    expect(fail({ mode: "multi_reference", prompt: "p", images: ["https://169.254.169.254/x"] })).toMatch(/https/);
    expect(isPublicHttpsUrl("https://10.0.0.1/x")).toBe(false);
    expect(isPublicHttpsUrl("https://metadata.google.internal/x")).toBe(false);
    expect(isPublicHttpsUrl(IMG)).toBe(true);
  });

  it("drops empty arrays and empty strings from the normalized request", () => {
    const req = ok({ mode: "multi_reference", prompt: "p", images: [IMG], videos: [], audios: [], lipsyncing_audio: "" });
    expect(req).not.toHaveProperty("videos");
    expect(req).not.toHaveProperty("audios");
    expect(req).not.toHaveProperty("lipsyncing_audio");
  });
});

describe("Seedance25RequestSchema — per-mode refinements (01-API-REFERENCE.md)", () => {
  it("ugc: needs products and/or influencers; combined ≤ 30; never videos/audios/images", () => {
    expect(fail({ mode: "ugc", prompt: "p" })).toMatch(/at least one product or influencer/);
    const many = (n: number) => Array.from({ length: n }, () => IMG);
    expect(ok({ mode: "ugc", prompt: "p", products: many(15), influencers: many(15) }).products).toHaveLength(15);
    expect(fail({ mode: "ugc", prompt: "p", products: many(16), influencers: many(15) })).toMatch(/≤ 30/);
    expect(fail({ mode: "ugc", prompt: "p", products: [IMG], videos: [VID] })).toMatch(/videos is not accepted in ugc/);
    expect(fail({ mode: "ugc", prompt: "p", products: [IMG], audios: [AUD] })).toMatch(/audios is not accepted in ugc/);
    expect(fail({ mode: "ugc", prompt: "p", products: [IMG], images: [IMG] })).toMatch(/images is not accepted in ugc/);
    // influencers alone is fine
    expect(ok({ mode: "ugc", prompt: "p", influencers: [IMG2] }).influencers).toEqual([IMG2]);
  });

  it("text_to_video: prompt only, no media at all", () => {
    expect(ok({ mode: "text_to_video", prompt: "p" }).mode).toBe("text_to_video");
    expect(fail({ mode: "text_to_video", prompt: "p", images: [IMG] })).toMatch(/images is not accepted/);
    expect(fail({ mode: "text_to_video", prompt: "p", products: [IMG] })).toMatch(/products is not accepted/);
  });

  it("multi_reference: at least one of images/videos/audios; no products/influencers", () => {
    expect(fail({ mode: "multi_reference", prompt: "p" })).toMatch(/at least one image, video or audio/);
    expect(ok({ mode: "multi_reference", prompt: "p", videos: [VID] }).videos).toEqual([VID]);
    expect(ok({ mode: "multi_reference", prompt: "p", audios: [AUD] }).audios).toEqual([AUD]);
    expect(fail({ mode: "multi_reference", prompt: "p", images: [IMG], products: [IMG] })).toMatch(/products is not accepted/);
  });

  it("first_n_last_frames: first_frame_image required, last optional, aspect forced adaptive", () => {
    expect(fail({ mode: "first_n_last_frames", prompt: "p" })).toMatch(/first_frame_image/);
    const req = ok({ mode: "first_n_last_frames", prompt: "p", first_frame_image: IMG, aspect_ratio: "9:16", duration: 10 });
    expect(req.aspect_ratio).toBe("adaptive");
    expect(req.duration).toBe(10);
    expect(req).not.toHaveProperty("last_frame_image");
    expect(ok({ mode: "first_n_last_frames", prompt: "p", first_frame_image: IMG, last_frame_image: IMG2 }).last_frame_image).toBe(IMG2);
    expect(fail({ mode: "first_n_last_frames", prompt: "p", first_frame_image: IMG, images: [IMG] })).toMatch(/images is not accepted/);
  });

  it("multi_frame: segments required, durations sum 4–30, duration := sum, top-level prompt optional", () => {
    expect(fail({ mode: "multi_frame" })).toMatch(/multi_frame_prompts/);
    expect(fail({ mode: "multi_frame", multi_frame_prompts: [{ prompt: "a", duration: 3 }] })).toMatch(/sum to 4–30 s \(got 3\)/);
    expect(fail({ mode: "multi_frame", multi_frame_prompts: [{ prompt: "a", duration: 20 }, { prompt: "b", duration: 11 }] })).toMatch(/got 31/);
    const req = ok({
      mode: "multi_frame",
      multi_frame_prompts: [{ prompt: "wide", duration: "10" }, { prompt: "close", duration: 20 }],
      images: [IMG],
    });
    expect(req.duration).toBe(30);
    expect(req.multi_frame_prompts).toEqual([{ prompt: "wide", duration: 10 }, { prompt: "close", duration: 20 }]);
    expect(req).not.toHaveProperty("prompt");
    expect(fail({ mode: "ugc", prompt: "p", products: [IMG], multi_frame_prompts: [{ prompt: "a", duration: 5 }] })).toMatch(/only valid in multi_frame/);
  });

  it("edit: videos ≥ 1 required, duration must be -1, aspect adaptive, output defaults to mov", () => {
    expect(fail({ mode: "edit", prompt: "p" })).toMatch(/requires at least one input video/);
    expect(fail({ mode: "edit", prompt: "p", videos: [VID], duration: 8 })).toMatch(/edit mode requires duration -1/);
    const req = ok({ mode: "edit", prompt: "remove the hat", videos: [VID], aspect_ratio: "16:9" });
    expect(req.duration).toBe(AUTO_DURATION);
    expect(req.aspect_ratio).toBe("adaptive");
    expect(req.output_format).toBe("mov");
    expect(ok({ mode: "edit", prompt: "p", videos: [VID], duration: -1, output_format: "mp4" }).output_format).toBe("mp4");
    expect(fail({ mode: "edit", prompt: "p", videos: [VID], products: [IMG] })).toMatch(/products is not accepted/);
  });

  it("extend: videos ≥ 1 required, aspect adaptive, mov default, duration allowed", () => {
    expect(fail({ mode: "extend", prompt: "p" })).toMatch(/requires at least one input video/);
    const req = ok({ mode: "extend", prompt: "keep going", videos: [VID], duration: 12, images: [IMG], audios: [AUD] });
    expect(req.duration).toBe(12);
    expect(req.aspect_ratio).toBe("adaptive");
    expect(req.output_format).toBe("mov");
    expect(req.images).toEqual([IMG]);
    expect(req.audios).toEqual([AUD]);
  });

  it("lipsyncing + voice_clone: images ≥ 1 and lipsyncing_audio required; no videos/audios", () => {
    for (const mode of ["lipsyncing", "voice_clone"] as const) {
      expect(fail({ mode, prompt: "p", lipsyncing_audio: AUD })).toMatch(/requires at least one image/);
      expect(fail({ mode, prompt: "p", images: [IMG] })).toMatch(/requires lipsyncing_audio/);
      const req = ok({ mode, prompt: "p", images: [IMG, IMG2], lipsyncing_audio: AUD, duration: 6 });
      expect(req.images).toHaveLength(2);
      expect(req.lipsyncing_audio).toBe(AUD);
      expect(req.aspect_ratio).toBe("9:16");
      expect(fail({ mode, prompt: "p", images: [IMG], lipsyncing_audio: AUD, videos: [VID] })).toMatch(/videos is not accepted/);
      expect(fail({ mode, prompt: "p", images: [IMG], lipsyncing_audio: AUD, audios: [AUD] })).toMatch(/audios is not accepted/);
    }
  });
});

describe("Seedance25GenerateBodySchema (POST /api/seedance/generate, engine 2.5)", () => {
  const request = { mode: "ugc", prompt: "p", products: [IMG], resolution: "720p" };

  it("requires engine literal 2.5 and a valid request", () => {
    expect(isSeedance25GenerateBody({ engine: "2.5" })).toBe(true);
    expect(isSeedance25GenerateBody({ engine: "2.0" })).toBe(false);
    expect(isSeedance25GenerateBody({ seedanceMode: "ugc" })).toBe(false);
    expect(isSeedance25GenerateBody(null)).toBe(false);
    expect(Seedance25GenerateBodySchema.safeParse({ engine: "2.0", request }).success).toBe(false);
    const body = Seedance25GenerateBodySchema.parse({ engine: "2.5", request, scriptText: "hi", campaignType: "promo", tone: "casual" });
    expect(body.request.mode).toBe("ugc");
    expect(resolveQualityTier(body)).toBe("draft-720p");
  });

  it("qualityTier must agree with request.resolution when both are present", () => {
    const bad = Seedance25GenerateBodySchema.safeParse({ engine: "2.5", request, qualityTier: "final-1080p" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(formatZodIssues(bad.error)).toMatch(/qualityTier/);
    const good = Seedance25GenerateBodySchema.parse({ engine: "2.5", request: { ...request, resolution: "1080p" }, qualityTier: "final-1080p" });
    expect(resolveQualityTier(good)).toBe("final-1080p");
  });

  it("rerenderOf and scriptId must be uuids", () => {
    expect(Seedance25GenerateBodySchema.safeParse({ engine: "2.5", request, rerenderOf: "nope" }).success).toBe(false);
    expect(
      Seedance25GenerateBodySchema.safeParse({
        engine: "2.5",
        request,
        rerenderOf: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(true);
  });

  it("RerenderBodySchema accepts an optional duration", () => {
    expect(RerenderBodySchema.parse({})).toEqual({});
    expect(RerenderBodySchema.parse({ duration: "12" })).toEqual({ duration: 12 });
    expect(RerenderBodySchema.safeParse({ duration: 99 }).success).toBe(false);
  });
});

describe("input-url helpers", () => {
  it("extractInputUrls copies only the media fields that are present", () => {
    const req = ok({ mode: "lipsyncing", prompt: "p", images: [IMG], lipsyncing_audio: AUD });
    expect(extractInputUrls(req)).toEqual({ images: [IMG], lipsyncing_audio: AUD });
    expect(hasVideoInputs(req)).toBe(false);
    expect(hasVideoInputs(ok({ mode: "extend", prompt: "p", videos: [VID] }))).toBe(true);
  });
});

describe("Seedance25CallbackSchema / parseSeedance25Callback", () => {
  it("parses the proven COMPLETED /status response (requestId, result, thumbnail, cost)", () => {
    const r = parseSeedance25Callback({
      success: true,
      requestId: "6a95874de2790f515a8f104a",
      status: "COMPLETED",
      result: "https://d2i9jqncnkplwq.cloudfront.net/videos/x.mp4",
      thumbnail: "https://d2i9jqncnkplwq.cloudfront.net/thumbnails/x.webp",
      cost: 1615.8,
    });
    expect(r).toEqual({
      requestId: "6a95874de2790f515a8f104a",
      status: "COMPLETED",
      resultUrl: "https://d2i9jqncnkplwq.cloudfront.net/videos/x.mp4",
      thumbnailUrl: "https://d2i9jqncnkplwq.cloudfront.net/thumbnails/x.webp",
      cost: 1615.8,
    });
  });

  it("parses the webhook shape (request_id, snake_case) and FAILED with error", () => {
    const done = parseSeedance25Callback({ request_id: "abc", result: "https://x.cloudfront.net/v.mp4", status: "COMPLETED", cost: "12.5" });
    expect(done?.requestId).toBe("abc");
    expect(done?.cost).toBe(12.5);
    const failed = parseSeedance25Callback({ request_id: "abc", status: "FAILED", error: "content policy" });
    expect(failed).toEqual({ requestId: "abc", status: "FAILED", error: "content policy" });
    const failedObj = parseSeedance25Callback({ request_id: "abc", status: "failed", error: { message: "nested" } });
    expect(failedObj?.error).toBe("nested");
    expect(failedObj?.status).toBe("FAILED");
  });

  it("handles the 2.0 webhook shape too (no cost) and nested data objects", () => {
    const r = parseSeedance25Callback({ request_id: "old", status: "COMPLETED", result: "https://x/v.mp4" });
    expect(r?.cost).toBeUndefined();
    const nested = parseSeedance25Callback({ data: { requestId: "n1", status: "IN_PROGRESS" } });
    expect(nested).toEqual({ requestId: "n1", status: "IN_PROGRESS" });
  });

  it("returns null without any request id, uses the fallback id when given", () => {
    expect(parseSeedance25Callback({ status: "COMPLETED" })).toBeNull();
    expect(parseSeedance25Callback({ status: "COMPLETED" }, "fallback")?.requestId).toBe("fallback");
    expect(parseSeedance25Callback("not an object")).toBeNull();
    expect(Seedance25CallbackSchema.safeParse({ request_id: "x", extra: 1 }).success).toBe(true);
  });

  it("normalizes unknown statuses to PROCESSING", () => {
    expect(normalizeSeedance25Status("rendering")).toBe("PROCESSING");
    expect(normalizeSeedance25Status("completed")).toBe("COMPLETED");
    expect(normalizeSeedance25Status("SUCCESS")).toBe("COMPLETED");
    expect(normalizeSeedance25Status("error")).toBe("FAILED");
    expect(normalizeSeedance25Status(undefined)).toBe("PROCESSING");
    expect(normalizeSeedance25Status("IN_QUEUE")).toBe("IN_QUEUE");
  });
});
