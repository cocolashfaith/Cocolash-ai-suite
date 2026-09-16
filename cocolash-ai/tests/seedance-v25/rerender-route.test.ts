import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/seedance/[id]/rerender/route";
import { createAdminClient } from "@/lib/supabase/server";
import {
  resetSeedanceSubmitRateLimit,
  SEEDANCE_SUBMIT_RATE_LIMIT,
} from "@/lib/seedance/submit-rate-limit";
import type { GeneratedVideo } from "@/lib/types";

/**
 * POST /api/seedance/[id]/rerender — "Re-render as Final" (D3, 03-PLAN.md §1.4).
 *
 * The whole point is fidelity: the copied request must keep the prompt and the
 * input URLs byte-identical, changing only the resolution (and, when asked, the
 * duration). Anything that is not a completed sub-1080p Seedance 2.5 job with a
 * stored payload is a 409 — never a silent re-queue.
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/seedance/client");

const SOURCE_ID = "88888888-8888-8888-8888-888888888888";
const NEW_ID = "99999999-9999-9999-9999-999999999999";
const PRODUCT = "https://cdn.shopify.com/s/files/1/0660/dahlia-915557.jpg";
const INFLUENCER = "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/x.jpg";
const INPUT_VIDEO = "https://cdn.example.com/inputs/clip.mp4";
const PROMPT = "The influencer holds the CocoLash lash kit and smiles at the camera";

const realFetch = global.fetch;

function ugcPayload(overrides: Record<string, unknown> = {}) {
  return {
    mode: "ugc",
    prompt: PROMPT,
    duration: 8,
    resolution: "720p",
    aspect_ratio: "9:16",
    products: [PRODUCT],
    influencers: [INFLUENCER],
    pass_faces: true,
    is_uncensored: false,
    output_format: "mp4",
    bitrate_mode: "standard",
    ...overrides,
  };
}

function sourceRow(overrides: Partial<GeneratedVideo> = {}): GeneratedVideo {
  return {
    id: SOURCE_ID,
    pipeline: "seedance",
    engine: "2.5",
    heygen_status: "completed",
    resolution: "720p",
    quality_tier: "draft-720p",
    seedance_mode: "ugc",
    requested_duration: 8,
    request_payload: ugcPayload(),
    script_text_cache: "Try the CocoLash lashes",
    script_id: null,
    background_type: "product-showcase",
    ...overrides,
  } as unknown as GeneratedVideo;
}

interface Harness {
  client: unknown;
  inserts: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
}

function makeSupabase(
  source: GeneratedVideo | null,
  /** Rows returned by the `rerender_of = source.id` idempotency lookup. */
  existingRerenders: Array<{ id: string }> = [],
  /** Error returned by that lookup instead of rows (e.g. a missing column). */
  existingRerendersError: { code: string; message: string } | null = null
): Harness {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];

  const client = {
    from(table: string) {
      const state: { op?: "insert" | "update"; inFilter?: boolean } = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        limit: async () =>
          state.inFilter
            ? { data: existingRerendersError ? null : existingRerenders, error: existingRerendersError }
            : { data: [], error: null },
        eq: () => chain,
        in() {
          state.inFilter = true;
          return chain;
        },
        insert(rowValue: Record<string, unknown>) {
          state.op = "insert";
          inserts.push(rowValue);
          return chain;
        },
        update(patch: Record<string, unknown>) {
          state.op = "update";
          updates.push(patch);
          return chain;
        },
        single: async () => {
          if (state.op === "insert") return { data: { id: NEW_ID }, error: null };
          if (table === "generated_videos") {
            return {
              data: source,
              error: source ? null : { code: "PGRST116", message: "no rows" },
            };
          }
          return { data: null, error: null };
        },
        maybeSingle: async () => ({ data: source, error: null }),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(onF, onR),
      };
      return chain;
    },
  };

  return { client, inserts, updates };
}

interface QueueCall {
  url: string;
  body: Record<string, unknown>;
}

function mockQueueFetch(): { calls: QueueCall[] } {
  const calls: QueueCall[] = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : {},
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, requestId: "rerender-task-id" }),
      text: async () => "{}",
    } as Response;
  }) as unknown as typeof fetch;
  return { calls };
}

function post(body: unknown = {}): NextRequest {
  return new NextRequest(`https://app.example.com/api/seedance/${SOURCE_ID}/rerender`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: SOURCE_ID });

describe("POST /api/seedance/[id]/rerender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSeedanceSubmitRateLimit();
    process.env.ENHANCOR_API_KEY = "test_enhancor_key";
    process.env.ENHANCOR_WEBHOOK_SECRET = "webhook-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
    delete process.env.ENHANCOR_API_KEY;
    delete process.env.ENHANCOR_WEBHOOK_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("404s for an unknown video", async () => {
    const harness = makeSupabase(null);
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(), { params });
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["a 2.0 row", { engine: "2.0" as const }],
    ["a pre-migration row (no engine)", { engine: undefined }],
    ["a row with no stored payload", { request_payload: null }],
    ["a row that is not completed", { heygen_status: "processing" as const }],
    ["a row that is already 1080p", { resolution: "1080p" }],
    ["a HeyGen row", { pipeline: "heygen" as const }],
  ])("409s for %s", async (_label, overrides) => {
    const harness = makeSupabase(sourceRow(overrides as Partial<GeneratedVideo>));
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(), { params });
    const json = (await response.json()) as { error: string; code: string };

    expect(response.status).toBe(409);
    expect(json.code).toBe("not_rerenderable");
    expect(calls).toHaveLength(0);
    expect(harness.inserts).toHaveLength(0);
  });

  it("re-queues at 1080p with a byte-identical prompt and inputs, linked via rerender_of", async () => {
    const harness = makeSupabase(sourceRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(), { params });
    const json = (await response.json()) as {
      videoId: string;
      engine: string;
      rerenderOf: string;
      estimate: { credits: number };
    };

    expect(response.status).toBe(200);
    expect(json.videoId).toBe(NEW_ID);
    expect(json.engine).toBe("2.5");
    expect(json.rerenderOf).toBe(SOURCE_ID);
    // 1080p standard rate 487.3 × 8 s
    expect(json.estimate.credits).toBe(3898.4);

    expect(calls).toHaveLength(1);
    expect(calls[0].body.resolution).toBe("1080p");
    expect(calls[0].body.prompt).toBe(PROMPT);
    expect(calls[0].body.products).toEqual([PRODUCT]);
    expect(calls[0].body.influencers).toEqual([INFLUENCER]);
    expect(calls[0].body.duration).toBe("8");

    const row = harness.inserts[0];
    expect(row.rerender_of).toBe(SOURCE_ID);
    expect(row.quality_tier).toBe("final-1080p");
    expect(row.resolution).toBe("1080p");
    expect((row.request_payload as Record<string, unknown>).prompt).toBe(PROMPT);
  });

  /**
   * F1 — the Final master always renders at the high bitrate. Enhancor rate
   * tables key on resolution x duration x video-inputs only, so "high" is free;
   * the draft's "standard" must not be copied forward onto the deliverable.
   */
  it("forces bitrate_mode high on the copied payload", async () => {
    const harness = makeSupabase(sourceRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(), { params });

    expect(response.status).toBe(200);
    // The source draft was rendered at "standard" …
    expect(
      (sourceRow().request_payload as Record<string, unknown>).bitrate_mode
    ).toBe("standard");
    // … the Final goes out at "high", and everything else is untouched.
    expect(calls[0].body.bitrate_mode).toBe("high");
    expect(calls[0].body.resolution).toBe("1080p");
    expect(calls[0].body.prompt).toBe(PROMPT);

    const row = harness.inserts[0];
    expect(row.bitrate_mode).toBe("high");
    expect((row.request_payload as Record<string, unknown>).bitrate_mode).toBe("high");
  });

  it("forces bitrate_mode high even when the source was already high", async () => {
    const harness = makeSupabase(
      sourceRow({
        request_payload: ugcPayload({ bitrate_mode: "high" }),
      } as Partial<GeneratedVideo>)
    );
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(), { params });

    expect(response.status).toBe(200);
    expect(calls[0].body.bitrate_mode).toBe("high");
  });

  it("applies a duration override", async () => {
    const harness = makeSupabase(sourceRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post({ duration: 12 }), { params });

    expect(response.status).toBe(200);
    expect(calls[0].body.duration).toBe("12");
    expect(harness.inserts[0].requested_duration).toBe(12);
  });

  it("ignores a duration override for edit (locked to Auto)", async () => {
    const harness = makeSupabase(
      sourceRow({
        seedance_mode: "edit",
        requested_duration: -1,
        request_payload: ugcPayload({
          mode: "edit",
          prompt: "Recolour the lashes",
          duration: -1,
          aspect_ratio: "adaptive",
          output_format: "mov",
          products: undefined,
          influencers: undefined,
          videos: [INPUT_VIDEO],
        }),
      })
    );
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post({ duration: 12 }), { params });

    expect(response.status).toBe(200);
    expect(calls[0].body.duration).toBe("-1");
    expect(harness.inserts[0].requested_duration).toBe(-1);
  });

  it("400s when the stored payload no longer validates", async () => {
    const harness = makeSupabase(
      sourceRow({
        request_payload: { mode: "ugc", prompt: PROMPT, duration: 8, resolution: "720p" },
      })
    );
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(), { params });
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toContain("ugc mode needs at least one product or influencer image");
    expect(calls).toHaveLength(0);
  });

  it("400s on an out-of-range duration override without touching Enhancor", async () => {
    const harness = makeSupabase(sourceRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post({ duration: 99 }), { params });

    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("accepts an empty body", async () => {
    const harness = makeSupabase(sourceRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch();

    const request = new NextRequest(
      `https://app.example.com/api/seedance/${SOURCE_ID}/rerender`,
      { method: "POST" }
    );
    const response = await POST(request, { params });

    expect(response.status).toBe(200);
  });

  // ── Idempotency: one source ⇒ at most one live 1080p re-render ──

  it("409s already_rerendered when a live re-render of the source exists", async () => {
    const harness = makeSupabase(sourceRow(), [{ id: NEW_ID }]);
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(), { params });
    const json = (await response.json()) as {
      error: string;
      code: string;
      existingVideoId: string;
    };

    expect(response.status).toBe(409);
    expect(json.code).toBe("already_rerendered");
    expect(json.existingVideoId).toBe(NEW_ID);
    // The whole point: no second billed job, no second row.
    expect(calls).toHaveLength(0);
    expect(harness.inserts).toHaveLength(0);
  });

  it("treats a missing `rerender_of` column as 'no existing re-render'", async () => {
    const harness = makeSupabase(sourceRow(), [], {
      code: "42703",
      message: 'column "rerender_of" does not exist',
    });
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(), { params });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("a double-clicked button bills once: the second call is a 409", async () => {
    const live: Array<{ id: string }> = [];
    const harness = makeSupabase(sourceRow(), live);
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const first = await POST(post(), { params });
    expect(first.status).toBe(200);
    // The row the first call inserted is now visible to the lookup.
    live.push({ id: NEW_ID });

    const second = await POST(post(), { params });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { code: string }).code).toBe("already_rerendered");
    expect(calls).toHaveLength(1);
  });

  // ── Per-session throttle ──

  it("429s rate_limited once the session's submissions are spent", async () => {
    const harness = makeSupabase(sourceRow());
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    for (let i = 0; i < SEEDANCE_SUBMIT_RATE_LIMIT.capacity; i++) {
      const ok = await POST(post(), { params });
      expect(ok.status).toBe(200);
    }
    const blocked = await POST(post(), { params });
    const json = (await blocked.json()) as { error: string; code: string };

    expect(blocked.status).toBe(429);
    expect(json.code).toBe("rate_limited");
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    // Nothing extra was queued once the bucket ran dry.
    expect(calls).toHaveLength(SEEDANCE_SUBMIT_RATE_LIMIT.capacity);
  });
});
