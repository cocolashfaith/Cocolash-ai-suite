import { describe, it, expect } from "vitest";
import {
  DEAD_VIDEO_HOST_RULES,
  isDeadMediaUrl,
  pickPlayableUrl,
  toVideoInputCandidate,
} from "@/lib/video/input-sources";
import type { GeneratedVideo } from "@/lib/types";

/**
 * Package C — "From your videos" source selection (D6).
 *
 * 59 of the 155 `generated_videos` rows point at the DEAD Cloudinary account
 * `dtnvppaty` (401) and 53 avatar rows at expired `files2.heygen.ai` signed
 * URLs. The picker must never hand one of those to Enhancor, so the fallback
 * order is final → raw, skipping anything on a known-dead host.
 */

const LIVE_CLOUDINARY =
  "https://res.cloudinary.com/dyianrt0w/video/upload/v1/cocolash/final.mp4";
const DEAD_CLOUDINARY =
  "https://res.cloudinary.com/dtnvppaty/video/upload/v1/cocolash/final.mp4";
const CLOUDFRONT = "https://d2i9jqncnkplwq.cloudfront.net/videos/abc-123.mp4";
const HEYGEN_EXPIRED =
  "https://files2.heygen.ai/aws_pacific/avatar_tmp/x.mp4?Expires=1";

function row(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
  return {
    id: "vid-1",
    script_id: null,
    person_image_id: null,
    person_image_url: null,
    product_image_url: null,
    composed_image_url: null,
    avatar_image_url: null,
    heygen_video_id: null,
    heygen_status: "completed",
    raw_video_url: CLOUDFRONT,
    final_video_url: LIVE_CLOUDINARY,
    thumbnail_url: null,
    duration_seconds: 8,
    aspect_ratio: "9:16",
    has_captions: false,
    has_watermark: false,
    has_background_music: false,
    voice_id: null,
    background_type: null,
    background_value: null,
    processing_cost: null,
    pipeline: "seedance",
    seedance_task_id: "task-1",
    seedance_prompt: null,
    audio_mode: null,
    audio_url: null,
    script_text_cache: null,
    caption_srt: null,
    created_at: "2026-09-01T12:00:00.000Z",
    completed_at: "2026-09-01T12:05:00.000Z",
    ...overrides,
  } as GeneratedVideo;
}

describe("DEAD_VIDEO_HOST_RULES", () => {
  it("names the dead Cloudinary cloud and the expired HeyGen hosts", () => {
    expect(DEAD_VIDEO_HOST_RULES.pathFragments).toContain("/dtnvppaty/");
    expect(DEAD_VIDEO_HOST_RULES.hosts).toContain("files.heygen.ai");
    expect(DEAD_VIDEO_HOST_RULES.hosts).toContain("files2.heygen.ai");
  });
});

describe("isDeadMediaUrl", () => {
  it("flags the dead Cloudinary cloud only (live clouds pass)", () => {
    expect(isDeadMediaUrl(DEAD_CLOUDINARY)).toBe(true);
    expect(isDeadMediaUrl(LIVE_CLOUDINARY)).toBe(false);
  });

  it("flags expired HeyGen hosts and their subdomains", () => {
    expect(isDeadMediaUrl(HEYGEN_EXPIRED)).toBe(true);
    expect(isDeadMediaUrl("https://files.heygen.ai/a.mp4")).toBe(true);
  });

  it("treats unparseable input as dead", () => {
    expect(isDeadMediaUrl("not a url")).toBe(true);
    expect(isDeadMediaUrl("")).toBe(true);
  });
});

describe("pickPlayableUrl", () => {
  it("prefers a live final_video_url", () => {
    expect(pickPlayableUrl(row())).toBe(LIVE_CLOUDINARY);
  });

  it("falls back to the CloudFront raw when the final is on the dead cloud", () => {
    expect(pickPlayableUrl(row({ final_video_url: DEAD_CLOUDINARY }))).toBe(
      CLOUDFRONT
    );
  });

  it("returns null when both URLs are dead or expired", () => {
    expect(
      pickPlayableUrl(
        row({ final_video_url: HEYGEN_EXPIRED, raw_video_url: HEYGEN_EXPIRED })
      )
    ).toBeNull();
  });

  it("returns null when nothing is set", () => {
    expect(pickPlayableUrl(row({ final_video_url: null, raw_video_url: null }))).toBeNull();
  });

  it("rejects non-https URLs", () => {
    expect(
      pickPlayableUrl(
        row({ final_video_url: "http://example.com/a.mp4", raw_video_url: null })
      )
    ).toBeNull();
  });
});

describe("toVideoInputCandidate", () => {
  it("builds a labelled candidate for a Seedance 2.5 row", () => {
    const candidate = toVideoInputCandidate(
      row({ engine: "2.5", seedance_mode: "ugc", duration_seconds: 12 })
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.id).toBe("vid-1");
    expect(candidate?.url).toBe(LIVE_CLOUDINARY);
    expect(candidate?.engine).toBe("2.5");
    expect(candidate?.mode).toBe("ugc");
    expect(candidate?.pipeline).toBe("seedance");
    expect(candidate?.label).toBe("Seedance 2.5 · ugc · 12s · 2026-09-01");
  });

  it("labels a pre-migration Seedance row as 2.0 and falls back to the campaign", () => {
    const candidate = toVideoInputCandidate(
      row({ engine: undefined, seedance_mode: undefined, background_type: "product_demo" })
    );
    expect(candidate?.engine).toBe("2.0");
    expect(candidate?.label).toBe("Seedance 2.0 · product_demo · 8s · 2026-09-01");
  });

  it("labels HeyGen rows by pipeline, never by the default engine column", () => {
    const candidate = toVideoInputCandidate(
      row({ pipeline: "heygen", engine: "2.0", seedance_mode: null })
    );
    expect(candidate?.pipeline).toBe("heygen");
    expect(candidate?.engine).toBeNull();
    expect(candidate?.label).toMatch(/^HeyGen · /);
  });

  it("omits missing label parts instead of printing null", () => {
    const candidate = toVideoInputCandidate(
      row({ seedance_mode: null, background_type: null, duration_seconds: null })
    );
    expect(candidate?.label).toBe("Seedance 2.0 · 2026-09-01");
    expect(candidate?.label).not.toMatch(/null|undefined|NaN/);
  });

  it("returns null when the row has no playable URL", () => {
    expect(
      toVideoInputCandidate(row({ final_video_url: DEAD_CLOUDINARY, raw_video_url: null }))
    ).toBeNull();
  });

  it("keeps thumbnail and duration when present", () => {
    const candidate = toVideoInputCandidate(
      row({ thumbnail_url: "https://cdn.example.com/t.jpg", duration_seconds: 6 })
    );
    expect(candidate?.thumbnailUrl).toBe("https://cdn.example.com/t.jpg");
    expect(candidate?.durationSeconds).toBe(6);
  });

  it("drops a dead thumbnail rather than rendering a broken image", () => {
    const candidate = toVideoInputCandidate(
      row({ thumbnail_url: "https://files2.heygen.ai/t.jpg" })
    );
    expect(candidate?.thumbnailUrl).toBeNull();
  });
});
