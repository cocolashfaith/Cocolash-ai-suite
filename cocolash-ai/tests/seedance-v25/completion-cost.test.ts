import { describe, it, expect, vi, beforeEach } from "vitest";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import { recordActualCost } from "@/lib/costs/tracker";
import { getVideoSettings } from "@/lib/settings/video-settings";
import { DEFAULT_VIDEO_SETTINGS } from "@/lib/settings/video-settings";
import { SEEDANCE_COSTS } from "@/lib/seedance/types";
import type { GeneratedVideo } from "@/lib/types";

/**
 * D4: Seedance 2.5 reports the REAL credit spend on the callback. That number
 * becomes `credits_cost`, and `processing_cost` becomes
 * `credits × video_settings.usd_per_credit` — replacing the provisional
 * estimate written at insert time. Seedance 2.0 keeps its legacy per-second
 * formula byte-for-byte (tests/seedance/completion-no-captions.test.ts pins it).
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

vi.mock("@/lib/settings/video-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings/video-settings")>();
  return { ...actual, getVideoSettings: vi.fn() };
});

const VIDEO_ID = "55555555-5555-5555-5555-555555555555";
const RAW_URL = "https://d2i9jqncnkplwq.cloudfront.net/videos/abc.mp4";

/** Thenable Supabase mock: only the atomic claim (update→in→select) resolves rows. */
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
      eq: () => obj,
      in() {
        state.inFilter = true;
        return obj;
      },
      single: () => resolve(),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        resolve().then(onF, onR),
    };
    return obj;
  }
  return { from: () => chain() } as never;
}

function baseVideo(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
  return {
    id: VIDEO_ID,
    heygen_status: "processing",
    duration_seconds: 6,
    aspect_ratio: "9:16",
    has_captions: false,
    caption_srt: null,
    ...overrides,
  } as unknown as GeneratedVideo;
}

describe("completeSeedanceVideo — 2.5 credit cost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVideoSettings).mockResolvedValue({
      ...DEFAULT_VIDEO_SETTINGS,
      usd_per_credit: 0.001,
    });
  });

  it("records the real credits and their USD value", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ engine: "2.5" }),
      rawVideoUrl: RAW_URL,
      thumbnailUrl: null,
      creditsCost: 1615.8,
      engine: "2.5",
    });

    expect(vi.mocked(recordActualCost)).toHaveBeenCalledWith(VIDEO_ID, 1.6158, {
      credits: 1615.8,
    });
    expect(result.credits_cost).toBe(1615.8);
    expect(result.heygen_status).toBe("completed");
  });

  it("honours a non-default usd_per_credit from settings", async () => {
    vi.mocked(getVideoSettings).mockResolvedValue({
      ...DEFAULT_VIDEO_SETTINGS,
      usd_per_credit: 0.002,
    });

    await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ engine: "2.5" }),
      rawVideoUrl: RAW_URL,
      creditsCost: 1000,
      engine: "2.5",
    });

    expect(vi.mocked(recordActualCost)).toHaveBeenCalledWith(VIDEO_ID, 2, { credits: 1000 });
  });

  it("leaves the provisional estimate alone when the callback carries no cost", async () => {
    await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ engine: "2.5" }),
      rawVideoUrl: RAW_URL,
      creditsCost: null,
      engine: "2.5",
    });

    expect(vi.mocked(recordActualCost)).not.toHaveBeenCalled();
    expect(vi.mocked(getVideoSettings)).not.toHaveBeenCalled();
  });

  it("keeps the legacy 2.0 formula when engine is omitted", async () => {
    await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ duration_seconds: 15 }),
      rawVideoUrl: RAW_URL,
    });

    expect(vi.mocked(recordActualCost)).toHaveBeenCalledTimes(1);
    const [id, cost, opts] = vi.mocked(recordActualCost).mock.calls[0];
    expect(id).toBe(VIDEO_ID);
    expect(cost).toBeCloseTo(
      15 * SEEDANCE_COSTS.COST_PER_SECOND_720P_NO_VIDEO + SEEDANCE_COSTS.POST_PROCESSING,
      5
    );
    expect(opts).toBeUndefined();
  });

  it("keeps the legacy 2.0 formula even when a stray cost is supplied", async () => {
    await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ duration_seconds: 15 }),
      rawVideoUrl: RAW_URL,
      creditsCost: 999,
      engine: "2.0",
    });

    const [, cost, opts] = vi.mocked(recordActualCost).mock.calls[0];
    expect(cost).toBeCloseTo(
      15 * SEEDANCE_COSTS.COST_PER_SECOND_720P_NO_VIDEO + SEEDANCE_COSTS.POST_PROCESSING,
      5
    );
    expect(opts).toBeUndefined();
  });

  it("does not record a cost when the row was already completed (dedupe)", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ heygen_status: "completed", engine: "2.5" }),
      rawVideoUrl: RAW_URL,
      creditsCost: 1615.8,
      engine: "2.5",
    });

    expect(vi.mocked(recordActualCost)).not.toHaveBeenCalled();
    expect(result.heygen_status).toBe("completed");
  });

  // ── The wizard card renders `processing_cost` off THIS return value ──

  it("returns the real USD as processing_cost, replacing the estimate", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      // The row still carries the provisional estimate written at insert time.
      video: baseVideo({ engine: "2.5", processing_cost: 3.09 }),
      rawVideoUrl: RAW_URL,
      creditsCost: 1615.8,
      engine: "2.5",
    });

    expect(result.processing_cost).toBe(1.6158);
  });

  it("keeps the provisional estimate when the callback carried no cost", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ engine: "2.5", processing_cost: 3.09 }),
      rawVideoUrl: RAW_URL,
      creditsCost: null,
      engine: "2.5",
    });

    expect(result.processing_cost).toBe(3.09);
  });

  it("returns the legacy 2.0 cost as processing_cost too", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ duration_seconds: 15, processing_cost: 99 }),
      rawVideoUrl: RAW_URL,
    });

    expect(result.processing_cost).toBeCloseTo(
      15 * SEEDANCE_COSTS.COST_PER_SECOND_720P_NO_VIDEO + SEEDANCE_COSTS.POST_PROCESSING,
      5
    );
  });

  // ── The thumbnail is rendered in an <img>: same guard as the video URL ──

  it("drops a provider thumbnail that is not a public https URL", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ engine: "2.5" }),
      rawVideoUrl: RAW_URL,
      thumbnailUrl: "http://169.254.169.254/latest/meta-data/",
      creditsCost: 1000,
      engine: "2.5",
    });

    // Cloudinary post-processing supplies its own thumbnail; the unsafe one is
    // never the value we fall back to.
    expect(result.thumbnail_url).toBe("https://cloud.example.com/thumb.jpg");
  });

  it("rejects an unsafe result URL outright", async () => {
    const result = await completeSeedanceVideo({
      supabase: makeSupabaseMock(),
      video: baseVideo({ engine: "2.5" }),
      rawVideoUrl: "https://[::ffff:127.0.0.1]/pwn.mp4",
      creditsCost: 1000,
      engine: "2.5",
    });

    expect(result.heygen_status).toBe("failed");
    expect(vi.mocked(recordActualCost)).not.toHaveBeenCalled();
  });
});
