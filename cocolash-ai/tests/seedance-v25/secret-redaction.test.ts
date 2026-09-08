/**
 * ENHANCOR_WEBHOOK_SECRET must never leave the process.
 *
 * It travels to Enhancor inside `webhook_url?token=…`, and Enhancor echoes the
 * offending request back in some 4xx bodies. That text is logged, written to
 * `generated_videos.error_message` and returned to the browser — so the scrub
 * happens where the provider text is READ, and again where the user-facing
 * detail is built.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSeedance25Task, querySeedance25Task } from "@/lib/seedance/v25/client";
import { describeSubmitError } from "@/lib/seedance/v25/generate";
import { redactWebhookSecret } from "@/lib/seedance/webhook-url";
import { SeedanceError } from "@/lib/seedance/types";
import type { Seedance25Request } from "@/lib/seedance/v25/types";

const SECRET = "s3cr3t-webhook-token";
const WEBHOOK_URL = `https://app.example.com/api/seedance/webhook?token=${SECRET}`;
const ECHO = `invalid request: {"webhook_url":"${WEBHOOK_URL}","mode":"ugc"}`;

const realFetch = global.fetch;

const request = {
  mode: "ugc",
  prompt: "The influencer holds the CocoLash lash kit",
  duration: 8,
  resolution: "720p",
  aspect_ratio: "9:16",
  products: ["https://cdn.shopify.com/s/files/1/0660/dahlia.jpg"],
  influencers: ["https://cdn.shopify.com/s/files/1/0660/model.jpg"],
  pass_faces: true,
  is_uncensored: false,
  output_format: "mp4",
  bitrate_mode: "standard",
} as unknown as Seedance25Request;

function mockFetchOnce(body: unknown, status = 422): void {
  global.fetch = vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe("redactWebhookSecret", () => {
  beforeEach(() => {
    process.env.ENHANCOR_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.ENHANCOR_WEBHOOK_SECRET;
  });

  it("replaces every occurrence, raw and URL-encoded", () => {
    const encoded = encodeURIComponent(SECRET);
    const out = redactWebhookSecret(`a ${SECRET} b ${encoded} c ${SECRET}`);
    expect(out).not.toContain(SECRET);
    expect(out).toBe("a [redacted] b [redacted] c [redacted]");
  });

  it("is a no-op when the secret is not configured", () => {
    delete process.env.ENHANCOR_WEBHOOK_SECRET;
    expect(redactWebhookSecret("nothing to hide")).toBe("nothing to hide");
  });

  it("leaves unrelated text alone", () => {
    expect(redactWebhookSecret("content moderation rejected the prompt")).toBe(
      "content moderation rejected the prompt"
    );
  });
});

describe("Seedance 2.5 client — provider errors are scrubbed", () => {
  beforeEach(() => {
    process.env.ENHANCOR_API_KEY = "test_key";
    process.env.ENHANCOR_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
    delete process.env.ENHANCOR_API_KEY;
    delete process.env.ENHANCOR_WEBHOOK_SECRET;
  });

  it("scrubs the secret out of a /queue error message and apiError", async () => {
    mockFetchOnce({ error: ECHO });

    await expect(createSeedance25Task(request, WEBHOOK_URL)).rejects.toSatisfy(
      (error: unknown) => {
        const e = error as SeedanceError;
        expect(e).toBeInstanceOf(SeedanceError);
        expect(e.message).not.toContain(SECRET);
        expect(e.message).toContain("[redacted]");
        expect(String(e.apiError)).not.toContain(SECRET);
        return true;
      }
    );
  });

  it("scrubs the secret out of a /status error too", async () => {
    mockFetchOnce({ message: ECHO }, 400);

    await expect(querySeedance25Task("req-1")).rejects.toSatisfy((error: unknown) => {
      const e = error as SeedanceError;
      expect(e.message).not.toContain(SECRET);
      expect(String(e.apiError)).not.toContain(SECRET);
      return true;
    });
  });

  it("never logs the secret (or the whole payload) on the happy path", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, requestId: "req-ok" }),
      text: async () => "{}",
    })) as unknown as typeof fetch;

    const { requestId } = await createSeedance25Task(request, WEBHOOK_URL);

    expect(requestId).toBe("req-ok");
    const joined = logs.join("\n");
    expect(joined).not.toContain(SECRET);
    // One compact line: counts and lengths, not the prompt text or the URLs.
    expect(joined).toContain("mode=ugc");
    expect(joined).toContain("prompt_chars=");
    expect(joined).not.toContain(request.prompt as string);
    expect(joined).not.toContain("cdn.shopify.com");
  });
});

describe("describeSubmitError", () => {
  beforeEach(() => {
    process.env.ENHANCOR_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.ENHANCOR_WEBHOOK_SECRET;
  });

  it("scrubs the secret from the detail that reaches error_message and the UI", () => {
    const detail = describeSubmitError(
      new SeedanceError(`Enhancor 2.5 API error (422): ${ECHO}`, 422, ECHO)
    );
    expect(detail).not.toContain(SECRET);
    expect(detail).toContain("[redacted]");
  });

  it("still surfaces the actionable provider reason", () => {
    const apiError = JSON.stringify({ error: { message: "prompt violates policy" } });
    expect(describeSubmitError(new SeedanceError("wrapper", 400, apiError))).toBe(
      "prompt violates policy"
    );
  });
});
