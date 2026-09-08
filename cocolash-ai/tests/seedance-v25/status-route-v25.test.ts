import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/seedance/[id]/status/route";
import { createAdminClient } from "@/lib/supabase/server";
import { querySeedanceTask } from "@/lib/seedance/client";
import { querySeedance25Task } from "@/lib/seedance/v25/client";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import { recordActualCost } from "@/lib/costs/tracker";
import { getVideoSettings, DEFAULT_VIDEO_SETTINGS } from "@/lib/settings/video-settings";
import type { GeneratedVideo, VideoStatusResponse } from "@/lib/types";

/**
 * GET /api/seedance/[id]/status — engine-aware polling (03-PLAN.md §1.3).
 *
 * A 2.5 row must be polled through the 2.5 status endpoint (POST /status), never
 * the legacy 2.0 client, and the response must carry the 2.5 metadata the
 * wizard's live progress panel and the gallery read.
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/seedance/client");
vi.mock("@/lib/seedance/v25/client");
vi.mock("@/lib/seedance/completion", () => ({
  completeSeedanceVideo: vi.fn(),
}));
vi.mock("@/lib/costs/tracker", () => ({
  recordActualCost: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/settings/video-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings/video-settings")>();
  return { ...actual, getVideoSettings: vi.fn() };
});

const VIDEO_ID = "77777777-7777-7777-7777-777777777777";
const TASK_ID = "6a95874de2790f515a8f104a";
const RESULT_URL = "https://d2i9jqncnkplwq.cloudfront.net/videos/abc.mp4";

function row(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
  return {
    id: VIDEO_ID,
    pipeline: "seedance",
    seedance_task_id: TASK_ID,
    heygen_status: "processing",
    duration_seconds: 8,
    processing_cost: 2.1544,
    engine: "2.5",
    seedance_mode: "ugc",
    quality_tier: "draft-720p",
    resolution: "720p",
    requested_duration: 8,
    credits_cost: null,
    error_message: null,
    rerender_of: null,
    ...overrides,
  } as unknown as GeneratedVideo;
}

interface Harness {
  client: unknown;
  updates: Array<Record<string, unknown>>;
}

function makeSupabase(video: GeneratedVideo | null): Harness {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from() {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          return chain;
        },
        single: async () => ({
          data: video,
          error: video ? null : { code: "PGRST116", message: "no rows" },
        }),
        maybeSingle: async () => ({ data: video, error: null }),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(onF, onR),
      };
      return chain;
    },
  };
  return { client, updates };
}

function get(): NextRequest {
  return new NextRequest(`https://app.example.com/api/seedance/${VIDEO_ID}/status`);
}

const params = Promise.resolve({ id: VIDEO_ID });

describe("GET /api/seedance/[id]/status — engine branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVideoSettings).mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("polls the 2.5 status endpoint for an engine-2.5 row (not the 2.0 client)", async () => {
    const harness = makeSupabase(row());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    vi.mocked(querySeedance25Task).mockResolvedValue({
      requestId: TASK_ID,
      status: "IN_PROGRESS",
    });

    const response = await GET(get(), { params });
    const json = (await response.json()) as VideoStatusResponse;

    expect(vi.mocked(querySeedance25Task)).toHaveBeenCalledWith(TASK_ID);
    expect(vi.mocked(querySeedanceTask)).not.toHaveBeenCalled();
    expect(json.status).toBe("processing");
    expect(json.progress).toBe(50);
  });

  it("polls the legacy 2.0 client for a pre-migration row", async () => {
    const harness = makeSupabase({
      id: VIDEO_ID,
      pipeline: "seedance",
      seedance_task_id: TASK_ID,
      heygen_status: "processing",
      duration_seconds: 15,
    } as unknown as GeneratedVideo);
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    vi.mocked(querySeedanceTask).mockResolvedValue({
      taskId: TASK_ID,
      status: "IN_PROGRESS",
    } as never);

    await GET(get(), { params });

    expect(vi.mocked(querySeedanceTask)).toHaveBeenCalledWith(TASK_ID);
    expect(vi.mocked(querySeedance25Task)).not.toHaveBeenCalled();
  });

  it("returns the 2.5 metadata on the status response", async () => {
    const harness = makeSupabase(
      row({ heygen_status: "completed", credits_cost: 2154.4, final_video_url: RESULT_URL })
    );
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const response = await GET(get(), { params });
    const json = (await response.json()) as VideoStatusResponse;

    expect(json.engine).toBe("2.5");
    expect(json.mode).toBe("ugc");
    expect(json.resolution).toBe("720p");
    expect(json.qualityTier).toBe("draft-720p");
    expect(json.requestedDuration).toBe(8);
    expect(json.creditsCost).toBe(2154.4);
    expect(json.costUsd).toBeCloseTo(2.1544, 4);
    expect(json.progress).toBe(100);
    // a completed row with a known cost never re-polls Enhancor
    expect(vi.mocked(querySeedance25Task)).not.toHaveBeenCalled();
  });

  it("backfills credits_cost for a completed 2.5 row whose cost is still null", async () => {
    const harness = makeSupabase(
      row({ heygen_status: "completed", credits_cost: null, final_video_url: RESULT_URL })
    );
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    vi.mocked(querySeedance25Task).mockResolvedValue({
      requestId: TASK_ID,
      status: "COMPLETED",
      resultUrl: RESULT_URL,
      cost: 1615.8,
    });

    const response = await GET(get(), { params });
    const json = (await response.json()) as VideoStatusResponse;

    expect(vi.mocked(querySeedance25Task)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordActualCost)).toHaveBeenCalledWith(VIDEO_ID, 1.6158, {
      credits: 1615.8,
    });
    expect(json.creditsCost).toBe(1615.8);
    expect(json.costUsd).toBeCloseTo(1.6158, 4);
  });

  it("never backfills a completed 2.0 row", async () => {
    const harness = makeSupabase({
      id: VIDEO_ID,
      pipeline: "seedance",
      seedance_task_id: TASK_ID,
      heygen_status: "completed",
      processing_cost: 3.09,
    } as unknown as GeneratedVideo);
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    await GET(get(), { params });

    expect(vi.mocked(querySeedance25Task)).not.toHaveBeenCalled();
    expect(vi.mocked(recordActualCost)).not.toHaveBeenCalled();
  });

  it("completes a 2.5 row through completeSeedanceVideo with the reported cost", async () => {
    const harness = makeSupabase(row());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    vi.mocked(querySeedance25Task).mockResolvedValue({
      requestId: TASK_ID,
      status: "COMPLETED",
      resultUrl: RESULT_URL,
      thumbnailUrl: "https://d2i9jqncnkplwq.cloudfront.net/thumbnails/abc.webp",
      cost: 2154.4,
    });
    vi.mocked(completeSeedanceVideo).mockResolvedValue(
      row({ heygen_status: "completed", credits_cost: 2154.4, final_video_url: RESULT_URL })
    );

    const response = await GET(get(), { params });
    const json = (await response.json()) as VideoStatusResponse;

    expect(vi.mocked(completeSeedanceVideo)).toHaveBeenCalledWith(
      expect.objectContaining({ rawVideoUrl: RESULT_URL, creditsCost: 2154.4, engine: "2.5" })
    );
    expect(json.status).toBe("completed");
    expect(json.finalVideoUrl).toBe(RESULT_URL);
  });

  it("writes error_message on a FAILED 2.5 row", async () => {
    const harness = makeSupabase(row());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    vi.mocked(querySeedance25Task).mockResolvedValue({
      requestId: TASK_ID,
      status: "FAILED",
      error: "content moderation rejected the prompt",
    });

    const response = await GET(get(), { params });
    const json = (await response.json()) as VideoStatusResponse;

    expect(harness.updates[0]).toMatchObject({
      heygen_status: "failed",
      error_message: "content moderation rejected the prompt",
    });
    expect(json.status).toBe("failed");
    expect(json.error).toBe("content moderation rejected the prompt");
  });

  it("returns 404 for an unknown video", async () => {
    const harness = makeSupabase(null);
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const response = await GET(get(), { params });
    expect(response.status).toBe(404);
  });

  it("degrades gracefully when the 2.5 poll throws", async () => {
    const harness = makeSupabase(row());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    vi.mocked(querySeedance25Task).mockRejectedValue(new Error("network down"));

    const response = await GET(get(), { params });
    const json = (await response.json()) as VideoStatusResponse;

    expect(response.status).toBe(200);
    expect(json.error).toBe("Failed to check video status");
    expect(json.status).toBe("processing");
  });

  it("500s with a fixed string — the internal detail stays in the server log", async () => {
    // The body used to be `error.message`, leaking hostnames/stack text.
    vi.mocked(createAdminClient).mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.7:5432 — db.internal")
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(get(), { params });
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to check video status");
    expect(JSON.stringify(json)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(json)).not.toContain("db.internal");
    expect(spy).toHaveBeenCalled();
  });
});
