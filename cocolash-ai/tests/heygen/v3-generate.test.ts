import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateVideoV3,
  getVideoStatusV3,
  createPhotoAvatarV3,
  supportsAvatarV,
  resolveAvatarEngine,
} from "@/lib/heygen/client";

/**
 * HeyGen v3 upgrade. The critical invariant: we must NEVER ask HeyGen to add
 * captions (no `caption` field) — captions are burned by our own Shotstack
 * pipeline downstream and must stay exactly as they are. We also send the new
 * quality controls (resolution, expressiveness, motion) and keep the ElevenLabs
 * audio path (audio_asset_id) so lip-sync matches our caption SRT.
 */

const realFetch = global.fetch;

function mockFetchCapturingBody(
  response: unknown
): { getBody: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  global.fetch = vi.fn(
    async (_url: string | URL | Request, opts?: RequestInit) => {
      if (opts?.body) captured = JSON.parse(opts.body as string);
      return {
        ok: true,
        json: async () => response,
      } as Response;
    }
  ) as unknown as typeof fetch;
  return { getBody: () => captured };
}

interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/**
 * Records every fetch call (url + parsed body + headers) and lets the test
 * program each response. Used for the Avatar V engine + fallback assertions.
 */
function mockFetchRecording(
  responder: (
    call: CapturedCall,
    index: number
  ) => { ok: boolean; status?: number; json: unknown }
): { calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  global.fetch = vi.fn(
    async (url: string | URL | Request, opts?: RequestInit) => {
      const call: CapturedCall = {
        url: String(url),
        body: opts?.body ? JSON.parse(opts.body as string) : {},
        headers: (opts?.headers as Record<string, string>) ?? {},
      };
      calls.push(call);
      const r = responder(call, calls.length - 1);
      return {
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 400),
        json: async () => r.json,
        text: async () => JSON.stringify(r.json),
      } as Response;
    }
  ) as unknown as typeof fetch;
  return { calls };
}

describe("HeyGen v3 client", () => {
  beforeEach(() => {
    process.env.HEYGEN_API_KEY = "test_key";
  });
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
    delete process.env.HEYGEN_API_KEY;
  });

  it("generateVideoV3 sends quality params and NEVER a caption field", async () => {
    const cap = mockFetchCapturingBody({ data: { video_id: "vid_123" } });

    const res = await generateVideoV3({
      avatarId: "look_1",
      audioAssetId: "audio_1",
      resolution: "4k",
      aspectRatio: "9:16",
      expressiveness: "high",
      motionPrompt: "gestures",
      title: "t",
    });

    expect(res.video_id).toBe("vid_123");
    const body = cap.getBody();
    expect(body.type).toBe("avatar");
    expect(body.avatar_id).toBe("look_1");
    expect(body.resolution).toBe("4k");
    expect(body.aspect_ratio).toBe("9:16");
    expect(body.expressiveness).toBe("high");
    expect(body.motion_prompt).toBe("gestures");
    expect(body.audio_asset_id).toBe("audio_1");
    // CRITICAL: we burn captions ourselves — HeyGen must not add its own.
    expect("caption" in body).toBe(false);
    // audio-asset path → no text voice
    expect("voice_id" in body).toBe(false);
    expect("script" in body).toBe(false);
  });

  it("generateVideoV3 falls back to voice_id + script when no audio asset", async () => {
    const cap = mockFetchCapturingBody({ data: { video_id: "v2" } });

    await generateVideoV3({
      avatarId: "a",
      voiceId: "voice_x",
      script: "hi there",
      resolution: "1080p",
      aspectRatio: "16:9",
    });

    const body = cap.getBody();
    expect(body.voice_id).toBe("voice_x");
    expect(body.script).toBe("hi there");
    expect("audio_asset_id" in body).toBe(false);
    expect("caption" in body).toBe(false);
  });

  it("Avatar V: sends engine:{type:'avatar_v'}, DROPS expressiveness, keeps motion_prompt", async () => {
    const { calls } = mockFetchRecording(() => ({
      ok: true,
      json: { data: { video_id: "v_av" } },
    }));

    const res = await generateVideoV3({
      avatarId: "look_v",
      audioAssetId: "audio_v",
      resolution: "1080p",
      aspectRatio: "9:16",
      engine: "avatar_v",
      expressiveness: "high", // passed in, but MUST be dropped for Avatar V
      motionPrompt: "gestures",
      idempotencyKey: "idem-1",
      title: "t",
    });

    expect(res.video_id).toBe("v_av");
    expect(calls).toHaveLength(1);
    const body = calls[0].body;
    expect(body.engine).toEqual({ type: "avatar_v" });
    // CRITICAL: expressiveness is rejected by HeyGen on Avatar V.
    expect("expressiveness" in body).toBe(false);
    expect(body.motion_prompt).toBe("gestures");
    expect("caption" in body).toBe(false);
    // Idempotency key is namespaced per engine.
    expect(calls[0].headers["Idempotency-Key"]).toBe("idem-1-avatar_v");
  });

  it("Avatar IV (default): no engine field, expressiveness kept, key namespaced", async () => {
    const { calls } = mockFetchRecording(() => ({
      ok: true,
      json: { data: { video_id: "v_iv" } },
    }));

    await generateVideoV3({
      avatarId: "look_iv",
      audioAssetId: "audio_iv",
      resolution: "1080p",
      aspectRatio: "9:16",
      expressiveness: "high",
      idempotencyKey: "idem-2",
    });

    const body = calls[0].body;
    expect("engine" in body).toBe(false);
    expect(body.expressiveness).toBe("high");
    expect(calls[0].headers["Idempotency-Key"]).toBe("idem-2-avatar_iv");
  });

  it("Avatar V falls back to Avatar IV when the look is ineligible (400)", async () => {
    const { calls } = mockFetchRecording((call) => {
      if (call.body.engine) {
        return {
          ok: false,
          status: 400,
          json: { error: "engine avatar_v not supported for this avatar look" },
        };
      }
      return { ok: true, json: { data: { video_id: "v_fallback" } } };
    });

    const res = await generateVideoV3({
      avatarId: "look_x",
      audioAssetId: "a",
      resolution: "1080p",
      aspectRatio: "9:16",
      engine: "avatar_v",
      expressiveness: "high",
      idempotencyKey: "idem-3",
    });

    expect(res.video_id).toBe("v_fallback");
    expect(calls).toHaveLength(2);
    // First attempt = Avatar V.
    expect(calls[0].body.engine).toEqual({ type: "avatar_v" });
    expect(calls[0].headers["Idempotency-Key"]).toBe("idem-3-avatar_v");
    // Fallback = Avatar IV: no engine, expressiveness restored, distinct key.
    expect("engine" in calls[1].body).toBe(false);
    expect(calls[1].body.expressiveness).toBe("high");
    expect(calls[1].headers["Idempotency-Key"]).toBe("idem-3-avatar_iv");
  });

  it("Avatar V does NOT fall back on an unrelated 400", async () => {
    const { calls } = mockFetchRecording(() => ({
      ok: false,
      status: 400,
      json: { error: "script exceeds maximum length" },
    }));

    await expect(
      generateVideoV3({
        avatarId: "look_y",
        audioAssetId: "a",
        resolution: "1080p",
        aspectRatio: "9:16",
        engine: "avatar_v",
      })
    ).rejects.toThrow();
    // No IV retry for a non-engine error.
    expect(calls).toHaveLength(1);
  });

  it("createPhotoAvatarV3 returns supportedEngines from the look", async () => {
    mockFetchRecording(() => ({
      ok: true,
      json: {
        data: {
          avatar_item: {
            id: "look_1",
            group_id: "g1",
            preview_image_url: "https://x/p.png",
            supported_api_engines: ["avatar_iv", "avatar_v"],
          },
        },
      },
    }));

    const r = await createPhotoAvatarV3("https://img/headshot.png");
    expect(r.talking_photo_id).toBe("look_1");
    expect(r.supportedEngines).toEqual(["avatar_iv", "avatar_v"]);
  });

  it("getVideoStatusV3 maps the v3 response to VideoStatusResult", async () => {
    mockFetchCapturingBody({
      data: {
        video_id: "v9",
        status: "completed",
        video_url: "https://x/v.mp4",
        thumbnail_url: "https://x/t.jpg",
        duration: 12,
      },
    });

    const s = await getVideoStatusV3("v9");
    expect(s.status).toBe("completed");
    expect(s.video_url).toBe("https://x/v.mp4");
    expect(s.thumbnail_url).toBe("https://x/t.jpg");
    expect(s.duration).toBe(12);
  });

  it("getVideoStatusV3 surfaces failure_message as error", async () => {
    mockFetchCapturingBody({
      data: { status: "failed", failure_message: "bad photo" },
    });

    const s = await getVideoStatusV3("v10");
    expect(s.status).toBe("failed");
    expect(s.error).toBe("bad photo");
  });
});

describe("Avatar V engine eligibility helpers", () => {
  it("supportsAvatarV matches avatar_v but never avatar_iv", () => {
    expect(supportsAvatarV(["avatar_iv", "avatar_v"])).toBe(true);
    expect(supportsAvatarV(["avatar_iv"])).toBe(false);
    expect(supportsAvatarV(["avatar_4_quality", "avatar_4_turbo"])).toBe(false);
    expect(supportsAvatarV([])).toBe(false);
  });

  it("resolveAvatarEngine (auto default) picks avatar_v only when eligible", () => {
    // Default policy is `auto` when HEYGEN_AVATAR_ENGINE is unset.
    expect(resolveAvatarEngine(["avatar_iv", "avatar_v"])).toBe("avatar_v");
    expect(resolveAvatarEngine(["avatar_iv"])).toBe("avatar_iv");
    expect(resolveAvatarEngine([])).toBe("avatar_iv");
  });
});
