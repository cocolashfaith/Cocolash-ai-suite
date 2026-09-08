import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/seedance/webhook/route";
import { createAdminClient } from "@/lib/supabase/server";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import { processVideo } from "@/lib/video/processor";
import { getVideoSettings, DEFAULT_VIDEO_SETTINGS } from "@/lib/settings/video-settings";
import type { GeneratedVideo } from "@/lib/types";

/**
 * POST /api/seedance/webhook — ONE public route, BOTH engines (03-PLAN.md §1.3).
 *
 * Enhancor delivers the same `request_id` more than once, so the route must be
 * idempotent: the atomic claim inside completeSeedanceVideo means only the first
 * COMPLETED does any work. A pre-migration row must never be patched with
 * `error_message` (PGRST204 would fail the whole update and break Seedance 2.0).
 *
 * `completeSeedanceVideo` is spied but NOT stubbed — the dedupe test needs the
 * real claim logic.
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/seedance/completion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/seedance/completion")>();
  return { completeSeedanceVideo: vi.fn(actual.completeSeedanceVideo) };
});
vi.mock("@/lib/video/processor", () => ({
  processVideo: vi.fn().mockResolvedValue({
    videoUrl: "https://cloud.example.com/processed.mp4",
    thumbnailUrl: "https://cloud.example.com/thumb.jpg",
    cloudinaryPublicId: "pub",
  }),
}));
vi.mock("@/lib/costs/tracker", () => ({
  recordActualCost: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/settings/video-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings/video-settings")>();
  return { ...actual, getVideoSettings: vi.fn() };
});

const TASK_ID = "6a95874de2790f515a8f104a";
const VIDEO_ID = "66666666-6666-6666-6666-666666666666";
const RESULT_URL = "https://d2i9jqncnkplwq.cloudfront.net/videos/abc.mp4";
const THUMB_URL = "https://d2i9jqncnkplwq.cloudfront.net/thumbnails/abc.webp";
const SECRET = "webhook-secret";

/** Post-migration rows carry the 14 new columns (possibly null); legacy rows do not. */
function postMigrationRow(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
  return {
    id: VIDEO_ID,
    pipeline: "seedance",
    seedance_task_id: TASK_ID,
    heygen_status: "processing",
    duration_seconds: 6,
    engine: "2.5",
    seedance_mode: "ugc",
    quality_tier: "draft-720p",
    resolution: "720p",
    requested_duration: 6,
    input_urls: null,
    request_payload: null,
    credits_cost: null,
    error_message: null,
    rerender_of: null,
    output_format: "mp4",
    bitrate_mode: "standard",
    is_uncensored: false,
    pass_faces: true,
    ...overrides,
  } as unknown as GeneratedVideo;
}

function legacyRow(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
  return {
    id: VIDEO_ID,
    pipeline: "seedance",
    seedance_task_id: TASK_ID,
    heygen_status: "processing",
    duration_seconds: 15,
    ...overrides,
  } as unknown as GeneratedVideo;
}

interface Harness {
  client: unknown;
  updates: Array<Record<string, unknown>>;
  /** Mutable status so the atomic claim can be simulated across deliveries. */
  state: { status: string };
}

/**
 * Supabase mock. `claimWins` = true simulates the real atomic claim
 * (`update(...).in(status).select()` returns the claimed row the first time and
 * nothing afterwards); false makes every claim a no-op so the route's argument
 * contract can be asserted without side effects.
 */
function makeSupabase(row: GeneratedVideo | null, claimWins = false): Harness {
  const updates: Array<Record<string, unknown>> = [];
  const state = { status: (row?.heygen_status as string) ?? "processing" };

  const client = {
    from() {
      const call = { op: "", inFilter: false, selected: false };
      const current = () => (row ? { ...row, heygen_status: state.status } : null);
      const resolve = () => {
        if (call.op === "update" && call.inFilter && call.selected) {
          if (claimWins && state.status !== "completed") {
            state.status = "completed";
            return Promise.resolve({ data: [{ id: VIDEO_ID }], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      const chain: Record<string, unknown> = {
        select() {
          call.selected = true;
          return chain;
        },
        eq: () => chain,
        in() {
          call.inFilter = true;
          return chain;
        },
        update(patch: Record<string, unknown>) {
          call.op = "update";
          updates.push(patch);
          return chain;
        },
        maybeSingle: async () => ({ data: current(), error: null }),
        single: async () => ({ data: current(), error: null }),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          resolve().then(onF, onR),
      };
      return chain;
    },
  };

  return { client, updates, state };
}

function callback(payload: unknown, token = SECRET): NextRequest {
  return new NextRequest(`https://app.example.com/api/seedance/webhook?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/seedance/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENHANCOR_WEBHOOK_SECRET = SECRET;
    vi.mocked(getVideoSettings).mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ENHANCOR_WEBHOOK_SECRET;
  });

  it("rejects a bad token with 401", async () => {
    const harness = makeSupabase(postMigrationRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const response = await POST(callback({ request_id: TASK_ID, status: "COMPLETED" }, "wrong"));
    expect(response.status).toBe(401);
  });

  it("returns 400 when the payload carries no request id", async () => {
    const harness = makeSupabase(postMigrationRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const response = await POST(callback({ status: "COMPLETED", result: RESULT_URL }));
    expect(response.status).toBe(400);
  });

  it("passes the real credit cost and engine to completeSeedanceVideo", async () => {
    const harness = makeSupabase(postMigrationRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const response = await POST(
      callback({
        request_id: TASK_ID,
        status: "COMPLETED",
        result: RESULT_URL,
        thumbnail: THUMB_URL,
        cost: 1615.8,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, processed: true });
    expect(vi.mocked(completeSeedanceVideo)).toHaveBeenCalledWith(
      expect.objectContaining({
        rawVideoUrl: RESULT_URL,
        thumbnailUrl: THUMB_URL,
        creditsCost: 1615.8,
        engine: "2.5",
      })
    );
  });

  it("treats a 2.0 payload without `cost` as engine 2.0 and still completes", async () => {
    const harness = makeSupabase(legacyRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const response = await POST(
      callback({ request_id: TASK_ID, status: "COMPLETED", result: RESULT_URL })
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(completeSeedanceVideo)).toHaveBeenCalledWith(
      expect.objectContaining({ creditsCost: null, engine: "2.0" })
    );
  });

  it("does NOT write error_message on a FAILED pre-migration row", async () => {
    const harness = makeSupabase(legacyRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    await POST(callback({ request_id: TASK_ID, status: "FAILED", error: "gpu exploded" }));

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0]).not.toHaveProperty("error_message");
    expect(harness.updates[0].heygen_status).toBe("failed");
  });

  it("writes a truncated error_message on a FAILED post-migration row", async () => {
    const harness = makeSupabase(postMigrationRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    await POST(
      callback({ request_id: TASK_ID, status: "FAILED", error: { message: "x".repeat(900) } })
    );

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0].heygen_status).toBe("failed");
    expect(String(harness.updates[0].error_message)).toHaveLength(500);
  });

  it("ignores a FAILED callback for an already-completed row", async () => {
    const harness = makeSupabase(postMigrationRow({ heygen_status: "completed" }));
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    await POST(callback({ request_id: TASK_ID, status: "FAILED", error: "late failure" }));
    expect(harness.updates).toHaveLength(0);
  });

  it("answers processed:false for an unknown request id", async () => {
    const harness = makeSupabase(null);
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const response = await POST(
      callback({ request_id: "nope", status: "COMPLETED", result: RESULT_URL })
    );
    expect(await response.json()).toEqual({ received: true, processed: false });
    expect(vi.mocked(completeSeedanceVideo)).not.toHaveBeenCalled();
  });

  it("answers processed:false for an in-flight status", async () => {
    const harness = makeSupabase(postMigrationRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const response = await POST(callback({ request_id: TASK_ID, status: "IN_PROGRESS" }));
    expect(await response.json()).toEqual({ received: true, processed: false });
  });

  it("never calls the Enhancor queue endpoint", async () => {
    const harness = makeSupabase(postMigrationRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const fetchSpy = vi.fn();
    const realFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;

    await POST(
      callback({ request_id: TASK_ID, status: "COMPLETED", result: RESULT_URL, cost: 100 })
    );

    global.fetch = realFetch;
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("processes the video exactly once when the same payload arrives twice", async () => {
    const harness = makeSupabase(postMigrationRow(), true);
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);

    const payload = {
      request_id: TASK_ID,
      status: "COMPLETED",
      result: RESULT_URL,
      cost: 1615.8,
    };

    await POST(callback(payload));
    await POST(callback(payload));

    expect(vi.mocked(completeSeedanceVideo)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(processVideo)).toHaveBeenCalledTimes(1);
    expect(harness.state.status).toBe("completed");
  });
});
