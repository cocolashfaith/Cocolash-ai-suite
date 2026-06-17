import { describe, it, expect, vi, beforeEach } from "vitest";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import type { GeneratedVideo } from "@/lib/types";

/**
 * Seedance videos ship with NO captions — captions are a HeyGen-only feature.
 * completeSeedanceVideo re-hosts the raw provider video on Cloudinary and marks
 * the row completed with has_captions=false and caption_srt=null, never burning
 * text onto the video. These tests lock that in (regression guard for the
 * caption-removal change).
 */

vi.mock("@/lib/video/processor", () => ({
  processVideo: vi.fn().mockResolvedValue({
    videoUrl: "https://cloud.example.com/processed.mp4",
    thumbnailUrl: "https://cloud.example.com/thumb.jpg",
    cloudinaryPublicId: "seedance-pub-id",
  }),
}));

vi.mock("@/lib/costs/tracker", () => ({
  recordActualCost: vi.fn().mockResolvedValue(undefined),
}));

const VIDEO_ID = "11111111-1111-1111-1111-111111111111";
const RAW_URL = "https://cdn.enhancor.example.com/output/video.mp4";

/**
 * Minimal thenable Supabase mock. The atomic claim is an
 * update(...).in(status).select(); everything else resolves to null data.
 */
function makeSupabaseMock() {
  function chain() {
    const state = { op: "", inFilter: false, selected: false };
    const resolve = () => {
      if (state.op === "update" && state.inFilter && state.selected) {
        return Promise.resolve({ data: [{ id: VIDEO_ID }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    const obj: Record<string, unknown> = {
      update() {
        state.op = "update";
        return obj;
      },
      select() {
        state.selected = true;
        return obj;
      },
      eq() {
        return obj;
      },
      in() {
        state.inFilter = true;
        return obj;
      },
      single() {
        return resolve();
      },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return resolve().then(onF, onR);
      },
    };
    return obj;
  }
  return { from: () => chain() } as never;
}

function baseVideo(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
  return {
    id: VIDEO_ID,
    heygen_status: "processing",
    duration_seconds: 15,
    aspect_ratio: "9:16",
    has_captions: false,
    caption_srt: null,
    ...overrides,
  } as unknown as GeneratedVideo;
}

describe("completeSeedanceVideo — no captions (Seedance)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Even with Shotstack configured, Seedance must not burn captions.
    process.env.SHOTSTACK_API_KEY = "shotstack_test_key";
  });

  it("completes uncaptioned and re-hosts on Cloudinary", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo(),
      rawVideoUrl: RAW_URL,
      thumbnailUrl: null,
    });

    expect(result.heygen_status).toBe("completed");
    expect(result.has_captions).toBe(false);
    expect(result.caption_srt).toBeNull();
    expect(result.final_video_url).toBe("https://cloud.example.com/processed.mp4");
  });

  it("drops any pre-existing caption_srt on a legacy row (no burn)", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({
        caption_srt: "1\n00:00:00,000 --> 00:00:02,000\nLegacy caption",
      }),
      rawVideoUrl: RAW_URL,
      thumbnailUrl: null,
    });

    expect(result.heygen_status).toBe("completed");
    expect(result.has_captions).toBe(false);
    expect(result.caption_srt).toBeNull();
  });

  it("rejects an unsafe (non-https/private) result URL", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo(),
      rawVideoUrl: "http://169.254.169.254/latest/meta-data",
      thumbnailUrl: null,
    });

    expect(result.heygen_status).toBe("failed");
  });
});
