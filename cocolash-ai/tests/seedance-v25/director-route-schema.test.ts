/**
 * Package F — POST /api/seedance/director zod schema for Seedance 2.5.
 *
 * The route must accept all nine modes, the 4–30 s duration range and the
 * Auto sentinel (-1), plus the new edit/extend/voice_clone media fields.
 * `runSeedanceDirector` is mocked — no LLM call ever happens here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/ai/director/seedance-director", () => {
  class SeedanceDirectorError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "SeedanceDirectorError";
    }
  }
  return {
    SeedanceDirectorError,
    runSeedanceDirector: vi.fn(async () => ({
      prompt: "mocked prompt",
      diagnostics: {
        model: "mock",
        systemPromptId: "seedance-director-extend",
        inputSummary: "mock",
        rawResponse: "mocked prompt",
        durationMs: 1,
      },
    })),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({}) as never),
  createAdminClient: vi.fn(() => ({}) as never),
}));

import { POST } from "@/app/api/seedance/director/route";
import { runSeedanceDirector } from "@/lib/ai/director/seedance-director";
import { SEEDANCE_25_MODES } from "@/lib/seedance/v25/types";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/seedance/director", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  mode: "extend" as const,
  campaignType: "product-showcase",
  tone: "casual",
  durationSeconds: 30,
  aspectRatio: "adaptive",
  sourceVideoUrls: ["https://example.com/a.mp4"],
  editInstruction: "continue the walk toward the mirror",
};

describe("POST /api/seedance/director — body schema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a 30 s extend request", async () => {
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(runSeedanceDirector).toHaveBeenCalledTimes(1);
  });

  it("accepts the Auto sentinel (-1)", async () => {
    const res = await POST(
      req({
        ...valid,
        mode: "edit",
        durationSeconds: -1,
        editInstruction: "make the room darker",
      })
    );
    expect(res.status).toBe(200);
  });

  it("accepts every one of the nine 2.5 modes", async () => {
    for (const mode of SEEDANCE_25_MODES) {
      const res = await POST(req({ ...valid, mode }));
      expect(res.status, `mode=${mode} must pass the schema`).toBe(200);
    }
  });

  it("rejects a duration above 30", async () => {
    const res = await POST(req({ ...valid, durationSeconds: 31 }));
    expect(res.status).toBe(400);
    expect(runSeedanceDirector).not.toHaveBeenCalled();
  });

  it("rejects a duration below 4 (other than -1)", async () => {
    const res = await POST(req({ ...valid, durationSeconds: 3 }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown mode", async () => {
    const res = await POST(req({ ...valid, mode: "voice" }));
    expect(res.status).toBe(400);
  });

  it("rejects more than 10 source videos", async () => {
    const res = await POST(
      req({
        ...valid,
        sourceVideoUrls: Array.from(
          { length: 11 },
          (_, i) => `https://example.com/${i}.mp4`
        ),
      })
    );
    expect(res.status).toBe(400);
  });

  it("accepts up to 10 multi-frame segments", async () => {
    const res = await POST(
      req({ ...valid, mode: "multi_frame", multiFrameSegmentCount: 10 })
    );
    expect(res.status).toBe(200);
  });

  it("accepts the new reference audio/video url arrays", async () => {
    const res = await POST(
      req({
        ...valid,
        mode: "multi_reference",
        referenceAudioUrls: ["https://example.com/a.mp3"],
        referenceVideoUrls: ["https://example.com/b.mp4"],
      })
    );
    expect(res.status).toBe(200);
  });
});
