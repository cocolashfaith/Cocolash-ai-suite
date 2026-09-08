import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/seedance/generate/route";
import { createAdminClient } from "@/lib/supabase/server";
import { createSeedanceTask } from "@/lib/seedance/client";
import { resolveSkuReferences } from "@/lib/seedance/reference-resolver";
import { MIGRATION_REQUIRED_CODE } from "@/lib/supabase/schema-errors";
import {
  SEEDANCE_SUBMIT_RATE_LIMIT,
  resetSeedanceSubmitRateLimit,
} from "@/lib/seedance/submit-rate-limit";

/**
 * POST /api/seedance/generate — the engine-2.5 branch (03-PLAN.md §1.2).
 *
 * Money-safety contract:
 *   - the row is INSERTed BEFORE /queue, so a missing migration costs nothing
 *     (503 migration_required and fetch is never called);
 *   - /queue is POSTed exactly once;
 *   - a legacy body (no `engine`) still reaches the untouched 2.0 handler.
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/seedance/client");
vi.mock("@/lib/seedance/reference-resolver");

const VIDEO_ID = "33333333-3333-3333-3333-333333333333";
const PRODUCT = "https://cdn.shopify.com/s/files/1/0660/dahlia-915557.jpg";
const INFLUENCER = "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/x.jpg";

const realFetch = global.fetch;

interface Recorded {
  table: string;
  row?: Record<string, unknown>;
  patch?: Record<string, unknown>;
}

interface Harness {
  client: unknown;
  inserts: Recorded[];
  updates: Recorded[];
}

function makeSupabase(
  opts: { insertError?: unknown; scriptRow?: Record<string, unknown> | null } = {}
): Harness {
  const inserts: Recorded[] = [];
  const updates: Recorded[] = [];

  const client = {
    from(table: string) {
      const state: { op?: "insert" | "update" } = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        // video_settings load: .select("*").order(...).limit(1)
        limit: async () => ({ data: [], error: null }),
        eq: () => chain,
        insert(row: Record<string, unknown>) {
          state.op = "insert";
          inserts.push({ table, row });
          return chain;
        },
        update(patch: Record<string, unknown>) {
          state.op = "update";
          updates.push({ table, patch });
          return chain;
        },
        single: async () => {
          if (state.op === "insert") {
            return opts.insertError
              ? { data: null, error: opts.insertError }
              : { data: { id: VIDEO_ID }, error: null };
          }
          if (table === "video_scripts") {
            return opts.scriptRow
              ? { data: opts.scriptRow, error: null }
              : { data: null, error: { code: "PGRST116", message: "no rows" } };
          }
          return { data: null, error: null };
        },
        maybeSingle: async () => ({ data: null, error: null }),
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

function mockQueueFetch(
  responder: (call: QueueCall) => { ok: boolean; status?: number; json: unknown }
): { calls: QueueCall[] } {
  const calls: QueueCall[] = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call: QueueCall = {
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : {},
    };
    calls.push(call);
    const r = responder(call);
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
      text: async () => JSON.stringify(r.json),
    } as Response;
  }) as unknown as typeof fetch;
  return { calls };
}

function post(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/seedance/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ugcBody(overrides: Record<string, unknown> = {}) {
  const { request: requestOverrides, ...rest } = overrides;
  return {
    engine: "2.5",
    request: {
      mode: "ugc",
      prompt: "The influencer holds the CocoLash lash kit and smiles at the camera",
      duration: 8,
      resolution: "720p",
      aspect_ratio: "9:16",
      products: [PRODUCT],
      influencers: [INFLUENCER],
      ...(requestOverrides as Record<string, unknown> | undefined),
    },
    ...rest,
  };
}

describe("POST /api/seedance/generate — engine 2.5", () => {
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

  it("bypasses the legacy validator (no personImageUrl error)", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch(() => ({ ok: true, json: { success: true, requestId: "req-1" } }));

    const response = await POST(post(ugcBody()));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(json)).not.toContain("personImageUrl");
  });

  it("returns 400 with formatted zod issues for an invalid 2.5 request", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch(() => ({ ok: true, json: { requestId: "x" } }));

    const response = await POST(
      post({
        engine: "2.5",
        request: {
          mode: "edit",
          prompt: "Recolour it",
          duration: 8,
          resolution: "720p",
        },
      })
    );
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toContain("request.videos");
    expect(json.error).toContain("edit mode requires at least one input video");
    expect(json.error).toContain("edit mode requires duration -1");
    expect(calls).toHaveLength(0);
    expect(harness.inserts).toHaveLength(0);
  });

  it("returns 503 migration_required on PGRST204 and NEVER calls Enhancor", async () => {
    const harness = makeSupabase({
      insertError: { code: "PGRST204", message: "Could not find the 'engine' column" },
    });
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch(() => ({ ok: true, json: { requestId: "x" } }));

    const response = await POST(post(ugcBody()));
    const json = (await response.json()) as { code: string; migration: string };

    expect(response.status).toBe(503);
    expect(json.code).toBe(MIGRATION_REQUIRED_CODE);
    expect(json.migration).toContain("20260908_seedance25.sql");
    expect(calls).toHaveLength(0);
  });

  it("inserts the 2.5 columns, queues once, links the task and prices in credits", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch(() => ({
      ok: true,
      json: { success: true, requestId: "6a95874de2790f515a8f104a" },
    }));

    const response = await POST(post(ugcBody()));
    const json = (await response.json()) as {
      videoId: string;
      taskId: string;
      status: string;
      engine: string;
      estimatedCost: number;
      estimate: { credits: number; billableSeconds: number; rateKind: string };
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      videoId: VIDEO_ID,
      taskId: "6a95874de2790f515a8f104a",
      status: "processing",
      engine: "2.5",
    });
    expect(json.estimate.credits).toBe(2154.4);
    expect(json.estimate.billableSeconds).toBe(8);
    expect(json.estimate.rateKind).toBe("standard");
    expect(json.estimatedCost).toBeCloseTo(2.15, 2);

    // exactly one POST to /queue
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/seedance2.5/v1/queue");
    expect(calls[0].body.duration).toBe("8");

    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(row.engine).toBe("2.5");
    expect(row.pipeline).toBe("seedance");
    expect(row.quality_tier).toBe("draft-720p");
    expect(row.requested_duration).toBe(8);
    expect(row.resolution).toBe("720p");
    expect(row.seedance_mode).toBe("ugc");
    expect((row.request_payload as Record<string, unknown>).mode).toBe("ugc");
    expect((row.input_urls as Record<string, unknown>).products).toEqual([PRODUCT]);
    expect(row.heygen_status).toBe("pending");
    expect(row.seedance_task_id).toBeNull();

    const linked = harness.updates.find((u) => u.patch?.seedance_task_id);
    expect(linked?.patch).toMatchObject({
      seedance_task_id: "6a95874de2790f515a8f104a",
      heygen_status: "processing",
    });
  });

  it("never persists webhook_url in request_payload", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch(() => ({ ok: true, json: { requestId: "req-2" } }));

    await POST(post(ugcBody()));

    const payload = harness.inserts[0].row!.request_payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("webhook_url");
    expect(JSON.stringify(harness.inserts[0].row)).not.toContain("webhook-secret");
  });

  it("marks the row failed with error_message and returns 500 when the queue call fails", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch(() => ({
      ok: false,
      status: 400,
      json: { error: "unsupported image format" },
    }));

    const response = await POST(post(ugcBody()));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(json.error).toContain("Seedance rejected the request");
    const failed = harness.updates.find((u) => u.patch?.heygen_status === "failed");
    expect(failed).toBeDefined();
    expect(String(failed?.patch?.error_message)).toContain("unsupported image format");
    expect(String(failed?.patch?.error_message).length).toBeLessThanOrEqual(500);
  });

  it("returns 404 when scriptId does not resolve", async () => {
    const harness = makeSupabase({ scriptRow: null });
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch(() => ({ ok: true, json: { requestId: "x" } }));

    const response = await POST(
      post(ugcBody({ scriptId: "44444444-4444-4444-8444-444444444444" }))
    );

    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
    expect(harness.inserts).toHaveLength(0);
  });

  it("stores multi_frame segments as a joined seedance_prompt", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch(() => ({ ok: true, json: { requestId: "mf-1" } }));

    await POST(
      post({
        engine: "2.5",
        request: {
          mode: "multi_frame",
          resolution: "720p",
          aspect_ratio: "9:16",
          multi_frame_prompts: [
            { prompt: "She opens the lash box", duration: 4 },
            { prompt: "She applies the lashes", duration: 4 },
          ],
        },
      })
    );

    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(row.seedance_prompt).toBe(
      "Shot 1 (4s): She opens the lash box\n\nShot 2 (4s): She applies the lashes"
    );
    expect(row.requested_duration).toBe(8);
  });

  it("prepends the lash brand directive for a ugc prompt that never mentions lashes", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch(() => ({ ok: true, json: { requestId: "guard-1" } }));

    await POST(
      post({
        engine: "2.5",
        request: {
          mode: "ugc",
          prompt: "She smiles at the camera holding the box",
          duration: 8,
          resolution: "720p",
          aspect_ratio: "9:16",
          products: [PRODUCT],
        },
      })
    );

    expect(String(calls[0].body.prompt)).toContain("CocoLash false-lash extension strips");
    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(String(row.seedance_prompt)).toContain("CocoLash false-lash extension strips");
  });

  it("stores duration_seconds null for Auto (-1)", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch(() => ({ ok: true, json: { requestId: "auto-1" } }));

    await POST(post(ugcBody({ request: { duration: -1 } })));

    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(row.duration_seconds).toBeNull();
    expect(row.requested_duration).toBe(-1);
  });
});

describe("POST /api/seedance/generate — legacy 2.0 body still works", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSeedanceSubmitRateLimit();
    process.env.ENHANCOR_API_KEY = "test_enhancor_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveSkuReferences).mockResolvedValue({
      productImages: [],
      influencerImages: [],
      images: [],
      degraded: false,
    } as never);
    vi.mocked(createSeedanceTask).mockResolvedValue("legacy-task-id" as never);
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
    delete process.env.ENHANCOR_API_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("routes a body without `engine` to the untouched 2.0 handler", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch(() => ({ ok: true, json: { requestId: "should-not-run" } }));

    const response = await POST(
      post({
        personImageUrl: INFLUENCER,
        productImageUrl: PRODUCT,
        campaignType: "product-showcase",
        tone: "casual",
        duration: 15,
        aspectRatio: "9:16",
        scriptText: "Try these lashes",
        overridePrompt: "A creator shows the CocoLash lashes",
      })
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(createSeedanceTask)).toHaveBeenCalledTimes(1);
    // the 2.0 client is mocked, so no raw fetch happens on the legacy path
    expect(calls).toHaveLength(0);

    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(row.engine).toBeUndefined();
    expect(row.pipeline).toBe("seedance");
  });
});

/**
 * Two abuse controls on the public submit door:
 *   - a per-session token bucket, so a stuck client cannot bill N jobs;
 *   - `rerenderOf` is INTERNAL — a browser cannot forge a re-render link.
 */
describe("POST /api/seedance/generate — abuse controls", () => {
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

  it("429s rate_limited after the session's submissions are spent, queueing nothing more", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch(() => ({
      ok: true,
      json: { success: true, requestId: "req-rl" },
    }));

    for (let i = 0; i < SEEDANCE_SUBMIT_RATE_LIMIT.capacity; i++) {
      expect((await POST(post(ugcBody()))).status).toBe(200);
    }

    const blocked = await POST(post(ugcBody()));
    const json = (await blocked.json()) as { error: string; code: string };

    expect(blocked.status).toBe(429);
    expect(json.code).toBe("rate_limited");
    expect(calls).toHaveLength(SEEDANCE_SUBMIT_RATE_LIMIT.capacity);
    expect(harness.inserts).toHaveLength(SEEDANCE_SUBMIT_RATE_LIMIT.capacity);
  });

  it("separate sessions get separate buckets", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch(() => ({ ok: true, json: { success: true, requestId: "req-rl" } }));

    const asSession = (token: string) =>
      new NextRequest("https://app.example.com/api/seedance/generate", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `cocolash-auth=${token}` },
        body: JSON.stringify(ugcBody()),
      });

    for (let i = 0; i < SEEDANCE_SUBMIT_RATE_LIMIT.capacity; i++) {
      expect((await POST(asSession("alice"))).status).toBe(200);
    }
    expect((await POST(asSession("alice"))).status).toBe(429);
    expect((await POST(asSession("bob"))).status).toBe(200);
  });

  it("strips a client-supplied rerenderOf (only the rerender route may set it)", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch(() => ({ ok: true, json: { success: true, requestId: "req-forge" } }));

    const forged = "11111111-1111-4111-8111-111111111111";
    const response = await POST(post(ugcBody({ rerenderOf: forged })));
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json.rerenderOf).toBeUndefined();
    expect((harness.inserts[0].row as Record<string, unknown>).rerender_of).toBeNull();
  });

  it("never echoes ENHANCOR_WEBHOOK_SECRET back to the client or into error_message", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    // Enhancor echoes the offending request back — webhook_url + token included.
    mockQueueFetch(() => ({
      ok: false,
      status: 422,
      json: {
        error:
          "invalid request: webhook_url=https://app.example.com/api/seedance/webhook?token=webhook-secret",
      },
    }));

    const response = await POST(post(ugcBody()));
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain("webhook-secret");
    expect(raw).toContain("[redacted]");

    const failure = harness.updates.find((u) => u.patch?.error_message);
    expect(String(failure?.patch?.error_message)).not.toContain("webhook-secret");
    expect(String(failure?.patch?.error_message)).toContain("[redacted]");
  });
});
