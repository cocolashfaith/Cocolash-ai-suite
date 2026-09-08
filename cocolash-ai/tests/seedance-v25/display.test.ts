import { describe, it, expect } from "vitest";
import {
  canRerenderAsFinal,
  statusToDisplay,
  videoCostLabel,
  videoDurationLabel,
  videoEngineLabel,
  videoModeLabel,
  videoResolutionLabel,
  videoTierLabel,
} from "@/lib/video/display";
import type { GeneratedVideo, VideoStatusResponse } from "@/lib/types";

/**
 * Package E — gallery metadata labels (D14).
 *
 * These are the pure functions VideoCard / VideoModal / the in-wizard progress
 * card all render from. Two hard requirements:
 *   1. A pre-migration row (none of the 2.5 columns present) must still render
 *      sensibly — "Seedance 2.0", no crash, no "undefined".
 *   2. A 2.5 row shows engine / mode / tier / duration / credits (+ ≈USD).
 */

function makeVideo(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
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
    raw_video_url: null,
    final_video_url: "https://cdn.example.com/v.mp4",
    thumbnail_url: null,
    duration_seconds: 15,
    aspect_ratio: "9:16",
    has_captions: false,
    has_watermark: false,
    has_background_music: false,
    voice_id: null,
    background_type: null,
    background_value: null,
    processing_cost: 3.075,
    pipeline: "seedance",
    seedance_task_id: "task-abc",
    seedance_prompt: null,
    audio_mode: null,
    audio_url: null,
    script_text_cache: null,
    caption_srt: null,
    created_at: "2026-09-08T10:26:43.000Z",
    completed_at: null,
    ...overrides,
  };
}

/** A 2.5 row as the migration + generate route write it. */
function make25(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
  return makeVideo({
    engine: "2.5",
    seedance_mode: "ugc",
    quality_tier: "draft-720p",
    resolution: "720p",
    requested_duration: 6,
    duration_seconds: 6,
    credits_cost: 1615.8,
    processing_cost: 1.6158,
    request_payload: { mode: "ugc", duration: 6 },
    ...overrides,
  });
}

describe("videoEngineLabel — pre-migration rows read as 2.0", () => {
  it("labels a legacy row (no engine column) 'Seedance 2.0'", () => {
    expect(videoEngineLabel(makeVideo())).toBe("Seedance 2.0");
  });

  it("labels an explicit null engine 'Seedance 2.0'", () => {
    expect(videoEngineLabel(makeVideo({ engine: null }))).toBe("Seedance 2.0");
  });

  it("labels a 2.5 row 'Seedance 2.5'", () => {
    expect(videoEngineLabel(make25())).toBe("Seedance 2.5");
  });
});

describe("videoModeLabel", () => {
  it("falls back to UGC for a 2.0 row with no seedance_mode", () => {
    expect(videoModeLabel(makeVideo())).toBe("UGC");
  });

  it("uses the 2.5 mode labels", () => {
    expect(videoModeLabel(make25({ seedance_mode: "edit" }))).toBe("Edit");
    expect(videoModeLabel(make25({ seedance_mode: "first_n_last_frames" }))).toBe(
      "First + Last Frame"
    );
    expect(videoModeLabel(make25({ seedance_mode: "voice_clone" }))).toBe("Voice Clone");
  });

  it("passes through an unknown mode string rather than showing undefined", () => {
    expect(videoModeLabel(make25({ seedance_mode: "future_mode" }))).toBe("future_mode");
  });
});

describe("videoTierLabel / videoResolutionLabel", () => {
  it("uses quality_tier when present", () => {
    expect(videoTierLabel(make25({ quality_tier: "draft-720p" }))).toBe("Draft 720p");
    expect(videoTierLabel(make25({ quality_tier: "final-1080p" }))).toBe("Final 1080p");
    expect(videoTierLabel(make25({ quality_tier: "draft-480p" }))).toBe("Draft 480p");
  });

  it("derives the tier from resolution when quality_tier is missing", () => {
    expect(videoTierLabel(make25({ quality_tier: null, resolution: "1080p" }))).toBe(
      "Final 1080p"
    );
  });

  it("returns an em dash for a pre-migration row with neither", () => {
    expect(videoTierLabel(makeVideo())).toBe("—");
    expect(videoResolutionLabel(makeVideo())).toBe("—");
  });

  it("shows the raw resolution", () => {
    expect(videoResolutionLabel(make25())).toBe("720p");
  });
});

describe("videoDurationLabel", () => {
  it("shows seconds for a fixed-duration row", () => {
    expect(videoDurationLabel(makeVideo({ duration_seconds: 15 }))).toBe("15s");
    expect(videoDurationLabel(make25({ duration_seconds: 8, requested_duration: 8 }))).toBe("8s");
  });

  it("shows Auto when requested_duration is -1 and the real length is unknown", () => {
    expect(
      videoDurationLabel(make25({ requested_duration: -1, duration_seconds: null }))
    ).toBe("Auto");
  });

  it("prefers the real length once the provider reports it, even for Auto", () => {
    expect(
      videoDurationLabel(make25({ requested_duration: -1, duration_seconds: 11 }))
    ).toBe("11s");
  });

  it("returns an em dash when nothing is known", () => {
    expect(videoDurationLabel(makeVideo({ duration_seconds: null }))).toBe("—");
  });
});

describe("videoCostLabel", () => {
  it("shows credits + ≈USD once the 2.5 provider reported cost", () => {
    expect(videoCostLabel(make25())).toBe("1,615.8 cr · $1.62");
  });

  it("rounds credits to 3dp and USD to cents", () => {
    expect(videoCostLabel(make25({ credits_cost: 8079, processing_cost: 8.079 }))).toBe(
      "8,079 cr · $8.08"
    );
  });

  it("derives USD from credits when processing_cost has not landed yet", () => {
    expect(videoCostLabel(make25({ credits_cost: 1000, processing_cost: null }))).toBe(
      "1,000 cr · $1.00"
    );
  });

  it("labels a 2.0 row's estimate as an estimate", () => {
    expect(videoCostLabel(makeVideo({ processing_cost: 3.075 }))).toBe("$3.08 est.");
  });

  it("returns an em dash when no cost is known", () => {
    expect(videoCostLabel(makeVideo({ processing_cost: null }))).toBe("—");
  });
});

describe("canRerenderAsFinal — D3 matrix", () => {
  it("true for a completed 2.5 draft with a stored request payload", () => {
    expect(canRerenderAsFinal(make25())).toBe(true);
    expect(canRerenderAsFinal(make25({ quality_tier: "draft-480p" }))).toBe(true);
  });

  it("false once the row is already Final 1080p", () => {
    expect(canRerenderAsFinal(make25({ quality_tier: "final-1080p" }))).toBe(false);
  });

  it("false while the row is still generating or failed", () => {
    expect(canRerenderAsFinal(make25({ heygen_status: "processing" }))).toBe(false);
    expect(canRerenderAsFinal(make25({ heygen_status: "failed" }))).toBe(false);
  });

  it("false without a stored request_payload (nothing to replay)", () => {
    expect(canRerenderAsFinal(make25({ request_payload: null }))).toBe(false);
  });

  it("false for a 2.0 row and for a HeyGen row", () => {
    expect(canRerenderAsFinal(makeVideo({ quality_tier: "draft-720p" }))).toBe(false);
    expect(canRerenderAsFinal(make25({ pipeline: "heygen" }))).toBe(false);
  });
});

describe("statusToDisplay — the status route's shape feeds the same labels", () => {
  it("maps the 2.5 status fields onto the display record", () => {
    const status: VideoStatusResponse = {
      videoId: "v1",
      status: "completed",
      progress: 100,
      finalVideoUrl: "https://cdn.example.com/v.mp4",
      engine: "2.5",
      mode: "ugc",
      resolution: "720p",
      qualityTier: "draft-720p",
      requestedDuration: 6,
      creditsCost: 1615.8,
      costUsd: 1.6158,
      durationSeconds: 6,
    };
    const d = statusToDisplay(status);
    expect(videoEngineLabel(d)).toBe("Seedance 2.5");
    expect(videoTierLabel(d)).toBe("Draft 720p");
    expect(videoCostLabel(d)).toBe("1,615.8 cr · $1.62");
    expect(videoDurationLabel(d)).toBe("6s");
    expect(canRerenderAsFinal(d)).toBe(true);
  });

  it("a pre-migration status response still renders (no 2.5 fields)", () => {
    const d = statusToDisplay({ videoId: "v1", status: "completed", progress: 100 });
    expect(videoEngineLabel(d)).toBe("Seedance 2.0");
    expect(videoCostLabel(d)).toBe("—");
    expect(canRerenderAsFinal(d)).toBe(false);
  });
});
