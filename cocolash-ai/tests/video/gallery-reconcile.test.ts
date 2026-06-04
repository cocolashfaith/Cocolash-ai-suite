import { describe, it, expect } from "vitest";
import {
  IN_FLIGHT_STATUSES,
  isInFlight,
  statusEndpoint,
  applyStatusUpdate,
  inFlightKey,
} from "@/lib/video/reconcile";
import type { GeneratedVideo, VideoStatusResponse } from "@/lib/types";

/**
 * Regression test for the live failure: a Seedance UGC video queued
 * successfully, Enhancor finished it, but the completion webhook was dropped
 * (ngrok tunnel pointed at the wrong local port). The generate page polls and
 * would have completed it — but the user navigated to the gallery, and the
 * gallery NEVER reconciled in-flight videos, so the card span "Processing"
 * for over an hour.
 *
 * The gallery now imports these exact helpers to drive reconciliation. These
 * assertions lock in the two correctness properties that, if regressed, would
 * reproduce the stuck-forever bug:
 *   1. A video is recognised as in-flight (so it gets polled at all).
 *   2. It is polled against ITS provider's route (Seedance ≠ HeyGen).
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
    heygen_status: "processing",
    raw_video_url: null,
    final_video_url: null,
    thumbnail_url: null,
    duration_seconds: 15,
    aspect_ratio: "9:16",
    has_captions: false,
    has_watermark: false,
    has_background_music: false,
    voice_id: null,
    background_type: null,
    background_value: null,
    processing_cost: null,
    pipeline: "seedance",
    seedance_task_id: "task-abc",
    seedance_prompt: null,
    audio_mode: null,
    audio_url: null,
    script_text_cache: null,
    caption_srt: null,
    created_at: "2026-06-04T10:26:43.000Z",
    completed_at: null,
    ...overrides,
  };
}

describe("isInFlight — which videos must be polled", () => {
  it("treats pending/processing/captioning as in-flight", () => {
    expect(isInFlight("pending")).toBe(true);
    expect(isInFlight("processing")).toBe(true);
    expect(isInFlight("captioning")).toBe(true);
  });

  it("treats terminal + nullish states as settled (no polling)", () => {
    expect(isInFlight("completed")).toBe(false);
    expect(isInFlight("failed")).toBe(false);
    expect(isInFlight(null)).toBe(false);
    expect(isInFlight(undefined)).toBe(false);
  });

  it("IN_FLIGHT_STATUSES contains exactly the non-terminal states", () => {
    expect([...IN_FLIGHT_STATUSES].sort()).toEqual(
      ["captioning", "pending", "processing"].sort()
    );
  });
});

describe("statusEndpoint — provider-correct routing (the core regression)", () => {
  it("routes a Seedance video to the Enhancor-aware status route", () => {
    const v = makeVideo({ id: "e7add44b", pipeline: "seedance" });
    expect(statusEndpoint(v)).toBe("/api/seedance/e7add44b/status");
  });

  it("routes a HeyGen video to the HeyGen-aware status route", () => {
    const v = makeVideo({ id: "hg-99", pipeline: "heygen" });
    expect(statusEndpoint(v)).toBe("/api/videos/hg-99/status");
  });

  it("does NOT poll a Seedance video against the HeyGen route", () => {
    // A Seedance video has no heygen_video_id; the HeyGen route could never
    // complete it. This is the exact mis-route that would strand the video.
    const v = makeVideo({ pipeline: "seedance", heygen_video_id: null });
    expect(statusEndpoint(v)).not.toContain("/api/videos/");
    expect(statusEndpoint(v)).toContain("/api/seedance/");
  });
});

describe("applyStatusUpdate — merging a completion back onto the card", () => {
  it("flips a processing card to completed with the final URL + thumbnail", () => {
    const v = makeVideo({ heygen_status: "processing" });
    const status: VideoStatusResponse = {
      videoId: v.id,
      status: "completed",
      finalVideoUrl: "https://cdn/final.mp4",
      thumbnailUrl: "https://cdn/thumb.webp",
      progress: 100,
    };
    const next = applyStatusUpdate(v, status);
    expect(next.heygen_status).toBe("completed");
    expect(next.final_video_url).toBe("https://cdn/final.mp4");
    expect(next.thumbnail_url).toBe("https://cdn/thumb.webp");
  });

  it("does not mutate the original card", () => {
    const v = makeVideo({ heygen_status: "processing" });
    applyStatusUpdate(v, { videoId: v.id, status: "completed", finalVideoUrl: "x" });
    expect(v.heygen_status).toBe("processing");
    expect(v.final_video_url).toBeNull();
  });

  it("preserves existing fields when the poll omits them (still processing)", () => {
    const v = makeVideo({
      heygen_status: "processing",
      final_video_url: "https://cdn/keep.mp4",
      thumbnail_url: "https://cdn/keep.webp",
    });
    const next = applyStatusUpdate(v, { videoId: v.id, status: "processing" });
    expect(next.heygen_status).toBe("processing");
    expect(next.final_video_url).toBe("https://cdn/keep.mp4");
    expect(next.thumbnail_url).toBe("https://cdn/keep.webp");
  });
});

describe("inFlightKey — stable poll subscription key", () => {
  it("lists only in-flight ids, sorted (stable across render order)", () => {
    const videos = [
      makeVideo({ id: "b", heygen_status: "processing" }),
      makeVideo({ id: "a", heygen_status: "completed" }),
      makeVideo({ id: "c", heygen_status: "pending" }),
    ];
    expect(inFlightKey(videos)).toBe("b,c");
    // Same set, different order → same key (no needless effect re-subscribe).
    expect(inFlightKey([videos[2], videos[0], videos[1]])).toBe("b,c");
  });

  it("returns empty string when nothing is generating (poller tears down)", () => {
    const videos = [
      makeVideo({ id: "a", heygen_status: "completed" }),
      makeVideo({ id: "b", heygen_status: "failed" }),
    ];
    expect(inFlightKey(videos)).toBe("");
  });
});
