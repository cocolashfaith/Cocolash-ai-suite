import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import type { GeneratedVideo } from "@/lib/types";

/**
 * Ports the HeyGen caption pattern to Seedance: on completion, a Seedance video
 * must generate an SRT from its script, persist it, and (when Shotstack is
 * configured) burn styled captions and mark has_captions=true. When Shotstack
 * is NOT configured, the SRT is still persisted so the status-route repair path
 * can retry, and has_captions stays false.
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
const SCRIPT =
  "These lashes are doing the heavy lifting while I do absolutely nothing today and tomorrow.";
const RAW_URL = "https://cdn.enhancor.example.com/output/video.mp4";

/**
 * Minimal thenable Supabase mock. Every chain method returns the same object
 * (which is awaitable); the resolved value is chosen from the recorded chain
 * state (table + whether it was an update with .in().select() = the claim, etc).
 */
function makeSupabaseMock() {
  function chain(table: string) {
    const state = { table, op: "", inFilter: false, selected: false };
    const resolve = () => {
      if (state.table === "video_scripts") {
        return Promise.resolve({ data: { script_text: SCRIPT }, error: null });
      }
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

function baseVideo(): GeneratedVideo {
  return {
    id: VIDEO_ID,
    heygen_status: "processing",
    script_id: "22222222-2222-2222-2222-222222222222",
    duration_seconds: 15,
    aspect_ratio: "9:16",
    has_captions: false,
    caption_srt: null,
  } as unknown as GeneratedVideo;
}

describe("completeSeedanceVideo — captions ported from HeyGen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.SHOTSTACK_API_KEY;
  });

  it("burns captions and sets has_captions when Shotstack is configured", async () => {
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
    expect(result.caption_srt).toBeTruthy();
    expect(result.caption_srt).not.toContain("undefined");

    expect(burnAndUploadCaptions).toHaveBeenCalledTimes(1);
    expect(burnAndUploadCaptions).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: "https://cloud.example.com/processed.mp4",
        videoPublicId: "seedance-pub-id",
        aspectRatio: "9:16",
        durationSeconds: 15,
      })
    );
  });

  it("persists the SRT but skips the burn when Shotstack is not configured", async () => {
    delete process.env.SHOTSTACK_API_KEY;

    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo(),
      rawVideoUrl: RAW_URL,
      thumbnailUrl: null,
    });

    expect(result.heygen_status).toBe("completed");
    expect(result.has_captions).toBe(false);
    expect(result.caption_srt).toBeTruthy(); // persisted for the repair path
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
