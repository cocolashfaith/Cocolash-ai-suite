import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import type { GeneratedVideo } from "@/lib/types";

/**
 * Seedance captions, ported from the HeyGen pattern.
 *
 * Caption *intent* is decided at generation time and persisted as the presence
 * of `caption_srt` on the row (see buildGenerationCaptionSrt in
 * app/api/seedance/generate/route.ts). On completion, completeSeedanceVideo:
 *   - burns styled captions + sets has_captions=true when caption_srt is present
 *     AND Shotstack is configured;
 *   - skips the burn (has_captions=false) but keeps caption_srt for the repair
 *     path when Shotstack is not configured;
 *   - adds NO captions at all when caption_srt is null (the "Stylized captions"
 *     toggle was OFF at generation time).
 */

vi.mock("@/lib/video/processor", () => ({
  processVideo: vi.fn().mockResolvedValue({
    videoUrl: "https://cloud.example.com/processed.mp4",
    thumbnailUrl: "https://cloud.example.com/thumb.jpg",
    cloudinaryPublicId: "seedance-pub-id",
  }),
}));

vi.mock("@/lib/video/burn-captions", () => ({
  burnAndUploadCaptions: vi
    .fn()
    .mockResolvedValue("https://cloud.example.com/captioned.mp4"),
}));

vi.mock("@/lib/costs/tracker", () => ({
  recordActualCost: vi.fn().mockResolvedValue(undefined),
}));

import { burnAndUploadCaptions } from "@/lib/video/burn-captions";

const VIDEO_ID = "11111111-1111-1111-1111-111111111111";
const RAW_URL = "https://cdn.enhancor.example.com/output/video.mp4";

// A pre-built SRT, as persisted at generation time when the "Stylized captions"
// toggle is ON. completeSeedanceVideo burns whatever is on the row — it no
// longer derives the SRT itself.
const CAPTION_SRT =
  "1\n00:00:00,000 --> 00:00:02,000\nThese lashes are doing the\n\n" +
  "2\n00:00:02,000 --> 00:00:04,000\nheavy lifting while I do nothing.";

/**
 * Minimal thenable Supabase mock. Every chain method returns the same object
 * (which is awaitable); the resolved value is chosen from the recorded chain
 * state (table + whether it was an update with .in().select() = the claim, etc).
 */
function makeSupabaseMock() {
  function chain(table: string) {
    const state = { table, op: "", inFilter: false, selected: false };
    const resolve = () => {
      if (state.op === "update" && state.inFilter && state.selected) {
        // The atomic claim (update ... .in(status).select())
        return Promise.resolve({ data: [{ id: VIDEO_ID }], error: null });
      }
      // Final update (update ... .eq()) or a select-single fallback
      return Promise.resolve({ data: null, error: null });
    };
    const obj: Record<string, unknown> = {
      update() {
        state.op = "update";
        return obj;
      },
      insert() {
        state.op = "insert";
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
  return { from: (t: string) => chain(t) } as never;
}

function baseVideo(
  overrides: Partial<GeneratedVideo> = {}
): GeneratedVideo {
  return {
    id: VIDEO_ID,
    heygen_status: "processing",
    script_id: "22222222-2222-2222-2222-222222222222",
    duration_seconds: 15,
    aspect_ratio: "9:16",
    has_captions: false,
    // Captions ON by default in these fixtures: the SRT was persisted at
    // generation time (see buildGenerationCaptionSrt).
    caption_srt: CAPTION_SRT,
    ...overrides,
  } as unknown as GeneratedVideo;
}

describe("completeSeedanceVideo — captions ported from HeyGen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.SHOTSTACK_API_KEY;
  });

  it("burns captions and sets has_captions when caption_srt is present and Shotstack is configured", async () => {
    process.env.SHOTSTACK_API_KEY = "shotstack_test_key";

    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo(),
      rawVideoUrl: RAW_URL,
      thumbnailUrl: null,
    });

    expect(result.heygen_status).toBe("completed");
    expect(result.has_captions).toBe(true);
    expect(result.final_video_url).toBe(
      "https://cloud.example.com/captioned.mp4"
    );
    expect(result.caption_srt).toBe(CAPTION_SRT);

    expect(burnAndUploadCaptions).toHaveBeenCalledTimes(1);
    expect(burnAndUploadCaptions).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: "https://cloud.example.com/processed.mp4",
        srtContent: CAPTION_SRT,
        videoPublicId: "seedance-pub-id",
        aspectRatio: "9:16",
        durationSeconds: 15,
      })
    );
  });

  it("keeps caption_srt but skips the burn when Shotstack is not configured", async () => {
    delete process.env.SHOTSTACK_API_KEY;

    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo(),
      rawVideoUrl: RAW_URL,
      thumbnailUrl: null,
    });

    expect(result.heygen_status).toBe("completed");
    expect(result.has_captions).toBe(false);
    expect(result.caption_srt).toBe(CAPTION_SRT); // preserved for the repair path
    expect(result.final_video_url).toBe(
      "https://cloud.example.com/processed.mp4"
    );
    expect(burnAndUploadCaptions).not.toHaveBeenCalled();
  });

  it("adds NO captions when caption_srt is null (toggle was OFF at generation)", async () => {
    process.env.SHOTSTACK_API_KEY = "shotstack_test_key";

    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ caption_srt: null }),
      rawVideoUrl: RAW_URL,
      thumbnailUrl: null,
    });

    expect(result.heygen_status).toBe("completed");
    expect(result.has_captions).toBe(false);
    expect(result.caption_srt).toBeNull();
    expect(result.final_video_url).toBe(
      "https://cloud.example.com/processed.mp4"
    );
    expect(burnAndUploadCaptions).not.toHaveBeenCalled();
  });

  it("rejects an unsafe (non-https/private) result URL", async () => {
    process.env.SHOTSTACK_API_KEY = "shotstack_test_key";

    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo(),
      rawVideoUrl: "http://169.254.169.254/latest/meta-data",
      thumbnailUrl: null,
    });

    expect(result.heygen_status).toBe("failed");
    expect(burnAndUploadCaptions).not.toHaveBeenCalled();
  });
});
