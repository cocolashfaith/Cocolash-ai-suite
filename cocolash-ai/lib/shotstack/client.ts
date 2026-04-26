/**
 * Shotstack Edit API Client
 *
 * Burns styled captions onto videos server-side using Shotstack's cloud
 * rendering infrastructure. Takes a video URL + SRT URL, renders with
 * pop-animated white text captions (active word highlighted in Golden
 * Brown #ce9765), and returns the captioned MP4.
 *
 * Uses the stage (sandbox) endpoint for dev, production for live.
 * Env: SHOTSTACK_API_KEY, SHOTSTACK_ENV (optional, defaults to "stage")
 */

const LOG = "[shotstack]";

type ShotstackEnv = "stage" | "v1";

function getConfig() {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SHOTSTACK_API_KEY environment variable");
  }

  const env: ShotstackEnv =
    (process.env.SHOTSTACK_ENV as ShotstackEnv) === "v1" ? "v1" : "stage";
  const baseUrl = `https://api.shotstack.io/edit/${env}`;

  return { apiKey, baseUrl };
}

// ── Types ────────────────────────────────────────────────────

export interface CaptionRenderOptions {
  videoUrl: string;
  srtUrl: string;
  durationSeconds: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
}

export interface RenderResult {
  id: string;
  status: string;
  url?: string;
}

// ── Submit Caption Render ────────────────────────────────────

export async function submitCaptionRender(
  opts: CaptionRenderOptions
): Promise<string> {
  const { apiKey, baseUrl } = getConfig();
  const { videoUrl, srtUrl, aspectRatio = "9:16" } = opts;

  const sizeMap: Record<string, { width: number; height: number }> = {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
  };

  const size = sizeMap[aspectRatio] ?? sizeMap["9:16"];

  // Built per the official Shotstack Rich Captions guide:
  // https://shotstack.io/docs/guide/architecting-an-application/rich-captions/
  //
  // Design:
  //   • Font: Montserrat ExtraBold 72px — bold, readable on 1080×1920
  //   • Plain white text, NO background pill — clean TikTok aesthetic
  //   • No stroke/outline; subtle drop shadow only for light contrast help
  //   • `animation.style: "pop"` — each word scales in as it's spoken
  //   • Active word stays white; pop animation provides the emphasis
  //   • Centered horizontally and lowered into the mid-lower hand area via
  //     clip offset.y: -0.23 on portrait avatar videos
  //
  // Font family MUST match the filename of the TTF (minus .ttf) for custom
  // fonts loaded from URL — docs show this pattern with hash URLs.
  const timeline = {
    fonts: [
      {
        src: "https://shotstack-assets.s3.amazonaws.com/fonts/Montserrat-ExtraBold.ttf",
      },
    ],
    tracks: [
      {
        clips: [
          {
            asset: {
              type: "rich-caption",
              src: srtUrl,
              font: {
                family: "Montserrat-ExtraBold",
                size: 72,
                color: "#FFFFFF",
                weight: 800,
                opacity: 1,
              },
              shadow: {
                offsetX: 0,
                offsetY: 4,
                blur: 8,
                color: "#000000",
                opacity: 0.5,
              },
              align: {
                horizontal: "center",
                vertical: "bottom",
              },
              animation: {
                style: "pop",
              },
              active: {
                font: {
                  color: "#FFFFFF",
                },
              },
            },
            start: 0,
            length: "end",
            offset: { x: 0, y: -0.23 },
          },
        ],
      },
      {
        clips: [
          {
            asset: {
              type: "video",
              src: videoUrl,
            },
            start: 0,
            length: "auto",
          },
        ],
      },
    ],
  };

  // Output tuned for social-media sharing AND Cloudinary's 100 MB
  // per-file limit. `quality: "medium"` is ~8 Mbps VBR — a 60-second
  // 1080x1920 clip lands around 60 MB. `"high"` (~12 Mbps) was producing
  // 100 MB+ files that Cloudinary rejected.
  const body = {
    timeline,
    output: {
      format: "mp4" as const,
      size,
      fps: 30,
      quality: "medium" as const,
    },
  };

  console.log(`${LOG} Submitting caption render — video: ${videoUrl.substring(0, 80)}…`);

  const res = await fetch(`${baseUrl}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`${LOG} Payload that failed:`, JSON.stringify(body, null, 2));
    throw new Error(`Shotstack render submit failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const renderId: string = data?.response?.id;

  if (!renderId) {
    throw new Error(`Shotstack render response missing ID: ${JSON.stringify(data)}`);
  }

  console.log(`${LOG} Render submitted — id: ${renderId}`);
  return renderId;
}

// ── Poll Render Status ───────────────────────────────────────

export async function pollRenderStatus(
  renderId: string,
  {
    maxAttempts = 60,
    intervalMs = 5000,
  }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<RenderResult> {
  const { apiKey, baseUrl } = getConfig();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/render/${renderId}`, {
        headers: { "x-api-key": apiKey },
      });
    } catch (err) {
      if (attempt < maxAttempts && isTransientNetworkError(err)) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `${LOG} Render ${renderId} status poll attempt ${attempt}/${maxAttempts} failed (${message}), retrying…`
        );
        await sleep(intervalMs);
        continue;
      }
      throw err;
    }

    if (!res.ok) {
      const text = await res.text();
      if (attempt < maxAttempts && isRetryableStatus(res.status)) {
        console.warn(
          `${LOG} Render ${renderId} status check returned ${res.status} (attempt ${attempt}/${maxAttempts}), retrying…`
        );
        await sleep(intervalMs);
        continue;
      }
      throw new Error(`Shotstack status check failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    const status: string = data?.response?.status;
    const url: string | undefined = data?.response?.url;

    console.log(`${LOG} Render ${renderId} — status: ${status} (attempt ${attempt}/${maxAttempts})`);

    if (status === "done") {
      if (!url) {
        throw new Error("Shotstack render done but no output URL returned");
      }
      return { id: renderId, status: "done", url };
    }

    if (status === "failed") {
      const error = data?.response?.error ?? "Unknown Shotstack render error";
      console.error(
        `${LOG} Render ${renderId} FAILED. Full response:`,
        JSON.stringify(data?.response ?? data, null, 2)
      );
      throw new Error(`Shotstack render failed: ${error}`);
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(`Shotstack render timed out after ${maxAttempts} attempts`);
}

// ── Upload SRT to Cloudinary (public URL) ────────────────────

export async function uploadSrtToCloudinary(
  srtContent: string,
  videoPublicId: string
): Promise<string> {
  const { v2: cloudinary } = await import("cloudinary");

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Missing Cloudinary env vars for SRT upload");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  const srtBuffer = Buffer.from(srtContent, "utf-8");
  const srtName = `${videoPublicId.replace(/\//g, "_")}_shotstack_srt`;

  const doUpload = () =>
    new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          public_id: srtName,
          folder: "cocolash-videos",
          format: "srt",
          overwrite: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(new Error(`SRT upload failed: ${error?.message ?? "no result"}`));
            return;
          }
          console.log(`${LOG} SRT uploaded — ${result.secure_url}`);
          resolve(result.secure_url);
        }
      );
      stream.end(srtBuffer);
    });

  // Retry Cloudinary upload up to 4 times on transient network errors
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await doUpload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts && isTransientNetworkError(err)) {
        const delay = 1500 * attempt;
        console.warn(`${LOG} SRT upload attempt ${attempt}/${maxAttempts} failed (${msg}), retrying in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("SRT upload failed after retries");
}

// ── Convenience: Full Pipeline ───────────────────────────────

export interface BurnCaptionsResult {
  captionedVideoUrl: string;
  renderId: string;
}

/**
 * Full pipeline: upload SRT, submit render, poll until done, return
 * the Shotstack output URL (publicly accessible MP4).
 */
export async function burnCaptionsWithShotstack(opts: {
  videoUrl: string;
  srtContent: string;
  durationSeconds: number;
  videoPublicId: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
}): Promise<BurnCaptionsResult> {
  const srtUrl = await uploadSrtToCloudinary(opts.srtContent, opts.videoPublicId);

  const renderId = await submitCaptionRender({
    videoUrl: opts.videoUrl,
    srtUrl,
    durationSeconds: opts.durationSeconds,
    aspectRatio: opts.aspectRatio,
  });

  const result = await pollRenderStatus(renderId);

  console.log(`${LOG} Caption burn complete — ${result.url}`);

  return {
    captionedVideoUrl: result.url!,
    renderId,
  };
}

// ── Helpers ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isTransientNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error && "cause" in error
      ? String((error as Error & { cause?: unknown }).cause)
      : "";
  return /ECONNRESET|ENOTFOUND|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|ConnectTimeoutError|socket hang up|fetch failed|terminated/i.test(
    `${message} ${cause}`
  );
}
