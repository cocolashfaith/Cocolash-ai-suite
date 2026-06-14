import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateVideoV3, getVideoStatusV3 } from "@/lib/heygen/client";

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
