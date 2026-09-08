import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildSeedance25QueuePayload,
  createSeedance25Task,
  querySeedance25Task,
} from "@/lib/seedance/v25/client";
import { SEEDANCE_25_API_BASE } from "@/lib/seedance/engines";
import { Seedance25RequestSchema } from "@/lib/seedance/v25/schema";
import { SeedanceError } from "@/lib/seedance/types";
import type { Seedance25Request } from "@/lib/seedance/v25/types";

/**
 * Seedance 2.5 client — wire-shape + billing-safety contract.
 *
 * The two invariants that cost real money if broken:
 *   1. ONE POST to /queue, ever. No retry (a retry = a second billed job).
 *   2. `webhook_url` carries the shared secret — it must never appear in logs.
 *
 * Shapes below are the POC-proven bodies (docs/seedance-2.5/01-API-REFERENCE.md).
 */

const WEBHOOK_URL = "https://app.example.com/api/seedance/webhook?token=s3cr3t-token";
const PRODUCT = "https://cdn.shopify.com/s/files/1/0660/dahlia-915557.jpg";
const INFLUENCER = "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/x.jpg";
const INPUT_VIDEO = "https://cdn.example.com/inputs/clip.mp4";

const realFetch = global.fetch;

function parse(input: unknown): Seedance25Request {
  return Seedance25RequestSchema.parse(input);
}

function ugcRequest(): Seedance25Request {
  return parse({
    mode: "ugc",
    prompt: "The influencer holds the CocoLash Dahlia lash kit and smiles",
    duration: 8,
    resolution: "720p",
    aspect_ratio: "9:16",
    products: [PRODUCT],
    influencers: [INFLUENCER],
  });
}

interface Recorded {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function mockFetch(
  responder: (call: Recorded, index: number) => {
    ok: boolean;
    status?: number;
    json: unknown;
  }
): { calls: Recorded[] } {
  const calls: Recorded[] = [];
  global.fetch = vi.fn(async (url: string | URL | Request, opts?: RequestInit) => {
    const call: Recorded = {
      url: String(url),
      body: opts?.body ? JSON.parse(opts.body as string) : {},
      headers: (opts?.headers as Record<string, string>) ?? {},
    };
    calls.push(call);
    const r = responder(call, calls.length - 1);
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
      text: async () => JSON.stringify(r.json),
    } as Response;
  }) as unknown as typeof fetch;
  return { calls };
}

describe("buildSeedance25QueuePayload — wire shape", () => {
  it("ugc payload is exactly the POC-proven body (no type, no full_access)", () => {
    const payload = buildSeedance25QueuePayload(ugcRequest(), WEBHOOK_URL);

    expect(payload).toEqual({
      mode: "ugc",
      prompt: "The influencer holds the CocoLash Dahlia lash kit and smiles",
      duration: "8",
      resolution: "720p",
      aspect_ratio: "9:16",
      webhook_url: WEBHOOK_URL,
      pass_faces: true,
      is_uncensored: false,
      output_format: "mp4",
      bitrate_mode: "standard",
      products: [PRODUCT],
      influencers: [INFLUENCER],
    });
    expect(payload).not.toHaveProperty("type");
    expect(payload).not.toHaveProperty("full_access");
    expect(payload).not.toHaveProperty("fast_mode");
  });

  it("duration is stringified on the wire", () => {
    const payload = buildSeedance25QueuePayload(ugcRequest(), WEBHOOK_URL);
    expect(payload.duration).toBe("8");
    expect(typeof payload.duration).toBe("string");
  });

  it("multi_frame payload carries no top-level prompt or duration", () => {
    const request = parse({
      mode: "multi_frame",
      multi_frame_prompts: [
        { prompt: "Shot one", duration: 4 },
        { prompt: "Shot two", duration: 4 },
      ],
      resolution: "720p",
      aspect_ratio: "9:16",
    });
    const payload = buildSeedance25QueuePayload(request, WEBHOOK_URL) as unknown as Record<
      string,
      unknown
    >;

    expect(payload).not.toHaveProperty("prompt");
    expect(payload).not.toHaveProperty("duration");
    expect(payload.multi_frame_prompts).toEqual([
      { prompt: "Shot one", duration: 4 },
      { prompt: "Shot two", duration: 4 },
    ]);
    expect(payload.webhook_url).toBe(WEBHOOK_URL);
  });

  it("edit payload sends duration '-1', adaptive aspect and mov output", () => {
    const request = parse({
      mode: "edit",
      prompt: "Recolour the lashes to match the packaging",
      duration: -1,
      resolution: "720p",
      aspect_ratio: "9:16",
      videos: [INPUT_VIDEO],
    });
    const payload = buildSeedance25QueuePayload(request, WEBHOOK_URL);

    expect(payload.duration).toBe("-1");
    expect(payload.aspect_ratio).toBe("adaptive");
    expect(payload.output_format).toBe("mov");
    expect(payload.videos).toEqual([INPUT_VIDEO]);
  });

  it("ugc never carries videos/audios even when the caller sneaks them in", () => {
    const request = { ...ugcRequest(), videos: [INPUT_VIDEO], audios: [INPUT_VIDEO] };
    const payload = buildSeedance25QueuePayload(request, WEBHOOK_URL) as unknown as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty("videos");
    expect(payload).not.toHaveProperty("audios");
  });
});

describe("createSeedance25Task — one POST, never retried", () => {
  beforeEach(() => {
    process.env.ENHANCOR_API_KEY = "test_enhancor_key";
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
    delete process.env.ENHANCOR_API_KEY;
  });

  it("POSTs once to the 2.5 /queue endpoint with the api key header", async () => {
    const { calls } = mockFetch(() => ({
      ok: true,
      json: { success: true, requestId: "6a95874de2790f515a8f104a" },
    }));

    const result = await createSeedance25Task(ugcRequest(), WEBHOOK_URL);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${SEEDANCE_25_API_BASE}/queue`);
    expect(calls[0].headers["x-api-key"]).toBe("test_enhancor_key");
    expect(result.requestId).toBe("6a95874de2790f515a8f104a");
    expect(result.payload.mode).toBe("ugc");
  });

  it("performs EXACTLY ONE fetch even when the response is 503", async () => {
    const { calls } = mockFetch(() => ({
      ok: false,
      status: 503,
      json: { error: "temporarily unavailable" },
    }));

    await expect(createSeedance25Task(ugcRequest(), WEBHOOK_URL)).rejects.toBeInstanceOf(
      SeedanceError
    );
    expect(calls).toHaveLength(1);
  });

  it("performs EXACTLY ONE fetch when the response is 500", async () => {
    const { calls } = mockFetch(() => ({ ok: false, status: 500, json: { error: "boom" } }));
    await expect(createSeedance25Task(ugcRequest(), WEBHOOK_URL)).rejects.toThrow(
      /Enhancor 2\.5 API error \(500\)/
    );
    expect(calls).toHaveLength(1);
  });

  it("throws missing_api_key without calling fetch when ENHANCOR_API_KEY is unset", async () => {
    delete process.env.ENHANCOR_API_KEY;
    const { calls } = mockFetch(() => ({ ok: true, json: { requestId: "x" } }));

    await expect(createSeedance25Task(ugcRequest(), WEBHOOK_URL)).rejects.toMatchObject({
      apiError: "missing_api_key",
    });
    expect(calls).toHaveLength(0);
  });

  it("never logs the webhook token", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockFetch(() => ({ ok: true, json: { success: true, requestId: "abc123" } }));

    await createSeedance25Task(ugcRequest(), WEBHOOK_URL);

    const logged = logSpy.mock.calls.map((c) => c.map((a) => String(a)).join(" ")).join("\n");
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain("s3cr3t-token");
    expect(logged).not.toContain("token=");
  });

  it("accepts request_id / id / data.requestId shapes", async () => {
    mockFetch(() => ({ ok: true, json: { data: { request_id: "nested-id" } } }));
    const result = await createSeedance25Task(ugcRequest(), WEBHOOK_URL);
    expect(result.requestId).toBe("nested-id");
  });

  it("throws when the queue response carries no request id", async () => {
    mockFetch(() => ({ ok: true, json: { success: true } }));
    await expect(createSeedance25Task(ugcRequest(), WEBHOOK_URL)).rejects.toMatchObject({
      apiError: "missing_request_id",
    });
  });
});

describe("querySeedance25Task", () => {
  beforeEach(() => {
    process.env.ENHANCOR_API_KEY = "test_enhancor_key";
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
    delete process.env.ENHANCOR_API_KEY;
  });

  it("parses the proven COMPLETED status payload including cost", async () => {
    const { calls } = mockFetch(() => ({
      ok: true,
      json: {
        success: true,
        requestId: "6a95874de2790f515a8f104a",
        status: "COMPLETED",
        result: "https://d2i9jqncnkplwq.cloudfront.net/videos/abc.mp4",
        thumbnail: "https://d2i9jqncnkplwq.cloudfront.net/thumbnails/abc.webp",
        cost: 1615.8,
      },
    }));

    const result = await querySeedance25Task("6a95874de2790f515a8f104a");

    expect(calls[0].url).toBe(`${SEEDANCE_25_API_BASE}/status`);
    expect(calls[0].body).toEqual({ request_id: "6a95874de2790f515a8f104a" });
    expect(result).toEqual({
      requestId: "6a95874de2790f515a8f104a",
      status: "COMPLETED",
      resultUrl: "https://d2i9jqncnkplwq.cloudfront.net/videos/abc.mp4",
      thumbnailUrl: "https://d2i9jqncnkplwq.cloudfront.net/thumbnails/abc.webp",
      cost: 1615.8,
    });
  });

  it("retries once on 503 (status polling is idempotent)", async () => {
    const { calls } = mockFetch((_call, index) =>
      index === 0
        ? { ok: false, status: 503, json: { error: "busy" } }
        : { ok: true, json: { requestId: "abc", status: "IN_PROGRESS" } }
    );

    const result = await querySeedance25Task("abc");
    expect(calls).toHaveLength(2);
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("throws invalid_response when the payload has no usable id", async () => {
    mockFetch(() => ({ ok: true, json: null }));
    await expect(querySeedance25Task("abc")).rejects.toMatchObject({
      apiError: "invalid_response",
    });
  });
});
