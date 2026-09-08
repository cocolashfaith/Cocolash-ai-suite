/**
 * Seedance 2.5 — zod validation for everything that crosses a boundary:
 *
 *   Seedance25RequestSchema      the Enhancor request (wire names, minus webhook_url)
 *   Seedance25GenerateBodySchema POST /api/seedance/generate body when engine === "2.5"
 *   RerenderBodySchema           POST /api/seedance/[id]/rerender body
 *   Seedance25CallbackSchema     webhook + /status payload → parseSeedance25Callback()
 *
 * Per-mode rules encode docs/seedance-2.5/01-API-REFERENCE.md "Modes × media
 * fields" exactly. The request schema BOTH validates AND normalizes:
 *   - edit                       → duration must be -1 (rejected otherwise)
 *   - edit/extend/first_n_last   → aspect_ratio coerced to "adaptive"
 *   - multi_frame                → duration := sum(segments), which must be 4–30
 *   - output_format default      → mov for edit/extend, mp4 elsewhere
 *   - empty arrays               → dropped (so the stored payload is clean)
 *
 * Unknown keys are stripped (zod object default) — the allow-list in
 * lib/seedance/mode-allowlist.ts is the second line of defence at the wire.
 */

import { z } from "zod";
import type { QualityTier, VideoInputUrls } from "@/lib/types";
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_DURATION_SECONDS,
  QUALITY_TIER_IDS,
  isAdaptiveOnlyMode,
  qualityTierToResolution,
  resolutionToQualityTier,
} from "../engines";
import {
  AUTO_DURATION,
  SEEDANCE_25_ASPECT_RATIOS,
  SEEDANCE_25_BITRATE_MODES,
  SEEDANCE_25_LIMITS,
  SEEDANCE_25_MODES,
  SEEDANCE_25_MOV_DEFAULT_MODES,
  SEEDANCE_25_OUTPUT_FORMATS,
  SEEDANCE_25_RESOLUTIONS,
  type Seedance25CallbackPayload,
  type Seedance25Mode,
  type Seedance25Request,
  type Seedance25TaskResult,
  type Seedance25TaskStatus,
} from "./types";

// ── URL safety (same rules as generate/completion SSRF guards) ─────────

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
}

/** Public https:// only — rejects localhost, private ranges, cloud metadata hosts. */
export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "metadata.google.internal"
    ) {
      return false;
    }
    const ipv6Mapped = hostname.match(/^\[?::ffff:(\d+\.\d+\.\d+\.\d+)\]?$/)?.[1];
    if (ipv6Mapped && isPrivateIpv4(ipv6Mapped)) return false;
    return !isPrivateIpv4(hostname) && hostname !== "::1" && hostname !== "[::1]";
  } catch {
    return false;
  }
}

const HttpsUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isPublicHttpsUrl, { message: "must be a public https:// URL" });

/** Single-URL fields: the wizard may send "" for an unused slot — treat as absent. */
const OptionalHttpsUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  HttpsUrl.optional()
);

// ── Duration inputs (accept "8" | 8 | -1) ────────────────────

const numericInput = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}, z.number().int());

/** 4–30 whole seconds, or -1 (Auto). */
export const DurationSchema = numericInput.refine(
  (d) =>
    d === AUTO_DURATION ||
    (d >= SEEDANCE_25_LIMITS.durationMin && d <= SEEDANCE_25_LIMITS.durationMax),
  {
    message: `duration must be ${SEEDANCE_25_LIMITS.durationMin}–${SEEDANCE_25_LIMITS.durationMax} seconds or -1 (Auto)`,
  }
);

/** Per-segment duration for multi_frame: 1–30 whole seconds (the SUM is range-checked). */
const SegmentDurationSchema = numericInput.refine(
  (d) => d >= 1 && d <= SEEDANCE_25_LIMITS.durationMax,
  { message: `segment duration must be 1–${SEEDANCE_25_LIMITS.durationMax} seconds` }
);

export const MultiFramePromptSchema = z.object({
  prompt: z.string().trim().min(1).max(3000),
  duration: SegmentDurationSchema,
});

// ── Request schema ───────────────────────────────────────────

const RequestObject = z.object({
  mode: z.enum(SEEDANCE_25_MODES),
  prompt: z.string().trim().max(SEEDANCE_25_LIMITS.maxPromptChars).optional(),
  duration: DurationSchema.optional(),
  resolution: z.enum(SEEDANCE_25_RESOLUTIONS).default("720p"),
  aspect_ratio: z.enum(SEEDANCE_25_ASPECT_RATIOS).default(DEFAULT_ASPECT_RATIO),
  images: z.array(HttpsUrl).max(SEEDANCE_25_LIMITS.maxImages).optional(),
  videos: z.array(HttpsUrl).max(SEEDANCE_25_LIMITS.maxVideos).optional(),
  audios: z.array(HttpsUrl).max(SEEDANCE_25_LIMITS.maxAudios).optional(),
  multi_frame_prompts: z
    .array(MultiFramePromptSchema)
    .max(SEEDANCE_25_LIMITS.maxMultiFrameSegments)
    .optional(),
  lipsyncing_audio: OptionalHttpsUrl,
  products: z.array(HttpsUrl).max(SEEDANCE_25_LIMITS.maxUgcRefs).optional(),
  influencers: z.array(HttpsUrl).max(SEEDANCE_25_LIMITS.maxUgcRefs).optional(),
  first_frame_image: OptionalHttpsUrl,
  last_frame_image: OptionalHttpsUrl,
  pass_faces: z.boolean().default(true),
  is_uncensored: z.boolean().default(false),
  output_format: z.enum(SEEDANCE_25_OUTPUT_FORMATS).optional(),
  bitrate_mode: z.enum(SEEDANCE_25_BITRATE_MODES).default("standard"),
});

type RequestDraft = z.output<typeof RequestObject>;

type MediaField =
  | "images"
  | "videos"
  | "audios"
  | "products"
  | "influencers"
  | "first_frame_image"
  | "last_frame_image"
  | "lipsyncing_audio";

const ALL_MEDIA_FIELDS: readonly MediaField[] = [
  "images",
  "videos",
  "audios",
  "products",
  "influencers",
  "first_frame_image",
  "last_frame_image",
  "lipsyncing_audio",
];

/** Which media fields each mode ACCEPTS (01-API-REFERENCE.md "Modes × media fields"). */
export const SEEDANCE_25_MODE_MEDIA_FIELDS: Record<Seedance25Mode, readonly MediaField[]> = {
  ugc: ["products", "influencers"],
  text_to_video: [],
  multi_reference: ["images", "videos", "audios"],
  first_n_last_frames: ["first_frame_image", "last_frame_image"],
  multi_frame: ["images", "videos", "audios"],
  edit: ["images", "videos", "audios"],
  extend: ["images", "videos", "audios"],
  lipsyncing: ["images", "lipsyncing_audio"],
  voice_clone: ["images", "lipsyncing_audio"],
};

function has(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function sumSegments(segments: { duration: number }[] | undefined): number {
  return (segments ?? []).reduce((s, seg) => s + seg.duration, 0);
}

function refineByMode(v: RequestDraft, ctx: z.RefinementCtx): void {
  const { mode } = v;
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  // prompt is required for every mode except multi_frame
  if (mode !== "multi_frame" && !has(v.prompt)) {
    issue("prompt", `prompt is required for ${mode} mode`);
  }

  // duration rules
  if (mode === "edit" && v.duration !== undefined && v.duration !== AUTO_DURATION) {
    issue("duration", "edit mode requires duration -1 (Auto)");
  }

  // multi_frame segments
  if (mode === "multi_frame") {
    if (!has(v.multi_frame_prompts)) {
      issue("multi_frame_prompts", "multi_frame mode requires multi_frame_prompts (≥1 segment)");
    } else {
      const total = sumSegments(v.multi_frame_prompts);
      if (total < SEEDANCE_25_LIMITS.durationMin || total > SEEDANCE_25_LIMITS.durationMax) {
        issue(
          "multi_frame_prompts",
          `multi_frame segment durations must sum to ${SEEDANCE_25_LIMITS.durationMin}–${SEEDANCE_25_LIMITS.durationMax} s (got ${total})`
        );
      }
    }
  } else if (has(v.multi_frame_prompts)) {
    issue("multi_frame_prompts", "multi_frame_prompts is only valid in multi_frame mode");
  }

  // media fields not accepted by this mode must be absent/empty
  const accepted = SEEDANCE_25_MODE_MEDIA_FIELDS[mode];
  for (const field of ALL_MEDIA_FIELDS) {
    if (!accepted.includes(field) && has(v[field])) {
      issue(field, `${field} is not accepted in ${mode} mode`);
    }
  }

  // per-mode requirements
  switch (mode) {
    case "ugc": {
      const products = v.products?.length ?? 0;
      const influencers = v.influencers?.length ?? 0;
      if (products + influencers === 0) {
        issue("products", "ugc mode needs at least one product or influencer image");
      }
      if (products + influencers > SEEDANCE_25_LIMITS.maxUgcRefs) {
        issue(
          "products",
          `products + influencers must be ≤ ${SEEDANCE_25_LIMITS.maxUgcRefs} (got ${products + influencers})`
        );
      }
      break;
    }
    case "multi_reference":
      if (!has(v.images) && !has(v.videos) && !has(v.audios)) {
        issue("images", "multi_reference mode needs at least one image, video or audio");
      }
      break;
    case "first_n_last_frames":
      if (!has(v.first_frame_image)) {
        issue("first_frame_image", "first_n_last_frames mode requires first_frame_image");
      }
      break;
    case "edit":
    case "extend":
      if (!has(v.videos)) {
        issue("videos", `${mode} mode requires at least one input video`);
      }
      break;
    case "lipsyncing":
    case "voice_clone":
      if (!has(v.images)) issue("images", `${mode} mode requires at least one image`);
      if (!has(v.lipsyncing_audio)) {
        issue("lipsyncing_audio", `${mode} mode requires lipsyncing_audio (≤ 30 s)`);
      }
      break;
    case "text_to_video":
    case "multi_frame":
      break;
  }
}

function arr(value: string[] | undefined): string[] | undefined {
  return value && value.length > 0 ? value : undefined;
}

function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val !== undefined) out[k] = val;
  }
  return out as T;
}

function normalizeByMode(v: RequestDraft): Seedance25Request {
  const { mode } = v;
  let duration: number;
  if (mode === "multi_frame") duration = sumSegments(v.multi_frame_prompts);
  else if (mode === "edit") duration = AUTO_DURATION;
  else duration = v.duration ?? DEFAULT_DURATION_SECONDS;

  const aspect_ratio = isAdaptiveOnlyMode(mode) ? "adaptive" : v.aspect_ratio;
  const output_format =
    v.output_format ?? (SEEDANCE_25_MOV_DEFAULT_MODES.includes(mode) ? "mov" : "mp4");

  return compact<Seedance25Request>({
    mode,
    prompt: has(v.prompt) ? v.prompt : undefined,
    duration,
    resolution: v.resolution,
    aspect_ratio,
    images: arr(v.images),
    videos: arr(v.videos),
    audios: arr(v.audios),
    multi_frame_prompts:
      v.multi_frame_prompts && v.multi_frame_prompts.length > 0 ? v.multi_frame_prompts : undefined,
    lipsyncing_audio: has(v.lipsyncing_audio) ? v.lipsyncing_audio : undefined,
    products: arr(v.products),
    influencers: arr(v.influencers),
    first_frame_image: has(v.first_frame_image) ? v.first_frame_image : undefined,
    last_frame_image: has(v.last_frame_image) ? v.last_frame_image : undefined,
    pass_faces: v.pass_faces,
    is_uncensored: v.is_uncensored,
    output_format,
    bitrate_mode: v.bitrate_mode,
  });
}

/** Validates + normalizes a 2.5 request. Output type is `Seedance25Request`. */
export const Seedance25RequestSchema = RequestObject.superRefine(refineByMode).transform(
  normalizeByMode
);

export type Seedance25RequestInput = z.input<typeof Seedance25RequestSchema>;

// ── Generate body (engine 2.5 branch of POST /api/seedance/generate) ────

export const Seedance25GenerateBodySchema = z
  .object({
    engine: z.literal("2.5"),
    /** The Enhancor request, wire field names, no webhook_url. */
    request: Seedance25RequestSchema,
    /** Optional; when present it must agree with request.resolution. Derived otherwise. */
    qualityTier: z.enum(QUALITY_TIER_IDS).optional(),
    scriptText: z.string().max(2500).optional(),
    scriptId: z.uuid().optional(),
    campaignType: z.string().max(64).optional(),
    tone: z.string().max(32).optional(),
    productSku: z.string().max(64).optional(),
    /** Set by POST /api/seedance/[id]/rerender, never by the wizard. */
    rerenderOf: z.uuid().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.qualityTier && qualityTierToResolution(body.qualityTier) !== body.request.resolution) {
      ctx.addIssue({
        code: "custom",
        path: ["qualityTier"],
        message: `qualityTier ${body.qualityTier} does not match request.resolution ${body.request.resolution}`,
      });
    }
  });

export type Seedance25GenerateBody = z.output<typeof Seedance25GenerateBodySchema>;

/** Cheap pre-check so the generate route can branch before full parsing. */
export function isSeedance25GenerateBody(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { engine?: unknown }).engine === "2.5";
}

export function resolveQualityTier(body: Pick<Seedance25GenerateBody, "qualityTier" | "request">): QualityTier {
  return body.qualityTier ?? resolutionToQualityTier(body.request.resolution);
}

// ── Re-render body ───────────────────────────────────────────

export const RerenderBodySchema = z.object({
  /** Optional override; ignored for edit (always -1). Defaults to the source row's duration. */
  duration: DurationSchema.optional(),
});
export type RerenderBody = z.output<typeof RerenderBodySchema>;

// ── Input-URL helpers (for generated_videos.input_urls) ─────

export function extractInputUrls(request: Seedance25Request): VideoInputUrls {
  return compact<VideoInputUrls>({
    products: request.products,
    influencers: request.influencers,
    images: request.images,
    videos: request.videos,
    audios: request.audios,
    first_frame_image: request.first_frame_image,
    last_frame_image: request.last_frame_image,
    lipsyncing_audio: request.lipsyncing_audio,
  });
}

export function hasVideoInputs(request: Pick<Seedance25Request, "videos">): boolean {
  return !!request.videos && request.videos.length > 0;
}

// ── Callback / status payload ────────────────────────────────

const StatusLike = z.looseObject({
  success: z.boolean().nullish(),
  request_id: z.string().nullish(),
  requestId: z.string().nullish(),
  id: z.string().nullish(),
  status: z.string().nullish(),
  result: z.string().nullish(),
  video_url: z.string().nullish(),
  thumbnail: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
  cost: z.union([z.number(), z.string()]).nullish(),
  error: z.union([z.string(), z.looseObject({ message: z.string().nullish() })]).nullish(),
});

/** Accepts the flat payload, or the same keys nested under `data`. */
export const Seedance25CallbackSchema = z.looseObject({
  data: StatusLike.nullish(),
}).and(StatusLike);

export function normalizeSeedance25Status(status: string | null | undefined): Seedance25TaskStatus {
  const s = (status ?? "").toUpperCase();
  switch (s) {
    case "PENDING":
    case "IN_QUEUE":
    case "IN_PROGRESS":
    case "PROCESSING":
    case "COMPLETED":
    case "FAILED":
      return s;
    case "SUCCESS":
    case "SUCCEEDED":
    case "DONE":
      return "COMPLETED";
    case "ERROR":
    case "FAILURE":
      return "FAILED";
    default:
      return "PROCESSING";
  }
}

function pickString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/**
 * Parse a webhook or /status payload into a Seedance25TaskResult.
 * Returns null when no request id can be determined (caller → 400).
 * Works for 2.0 payloads too (they simply lack `cost`).
 */
export function parseSeedance25Callback(
  raw: unknown,
  fallbackRequestId?: string
): Seedance25TaskResult | null {
  const parsed = Seedance25CallbackSchema.safeParse(raw);
  if (!parsed.success) return null;
  const flat = parsed.data as Seedance25CallbackPayload & {
    id?: string | null;
    data?: Seedance25CallbackPayload | null;
  };
  const nested = flat.data ?? undefined;

  const requestId = pickString(
    flat.request_id,
    flat.requestId,
    flat.id,
    nested?.request_id,
    nested?.requestId,
    fallbackRequestId
  );
  if (!requestId) return null;

  const status = normalizeSeedance25Status(pickString(flat.status, nested?.status));
  const resultUrl = pickString(flat.result, flat.video_url, nested?.result, nested?.video_url);
  const thumbnailUrl = pickString(
    flat.thumbnail,
    flat.thumbnail_url,
    nested?.thumbnail,
    nested?.thumbnail_url
  );

  const rawCost = flat.cost ?? nested?.cost;
  const cost =
    typeof rawCost === "number"
      ? rawCost
      : typeof rawCost === "string" && rawCost.trim() !== "" && !Number.isNaN(Number(rawCost))
        ? Number(rawCost)
        : undefined;

  const rawError = flat.error ?? nested?.error;
  const error =
    typeof rawError === "string"
      ? rawError
      : rawError && typeof rawError === "object" && typeof rawError.message === "string"
        ? rawError.message
        : undefined;

  return compact<Seedance25TaskResult>({
    requestId,
    status,
    resultUrl,
    thumbnailUrl,
    cost: cost !== undefined && Number.isFinite(cost) ? cost : undefined,
    error,
  });
}

// ── Error formatting for API responses ───────────────────────

/** "request.videos: edit mode requires at least one input video; request.duration: …" */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`)
    .join("; ");
}
