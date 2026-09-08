/**
 * Seedance engine registry — the ONE place that says what "2.0" and "2.5"
 * are, where they live, and what each can do.
 *
 *   2.0 = Enhancor "UGC Full Access" endpoint (lib/seedance/client.ts, legacy)
 *   2.5 = Enhancor "Seedance 2.5 Unrestricted" endpoint (lib/seedance/v25/*)
 *
 * Both use the same ENHANCOR_API_KEY and the same public webhook route
 * (/api/seedance/webhook). Capability flags drive the wizard UI (which
 * controls to show), the zod schema (what to accept) and the allow-list
 * (what to send). Decision D1: both engines ship; 2.5 is the default.
 *
 * Client-safe: no server-only imports.
 */

import type { QualityTier, SeedanceEngine } from "@/lib/types";
import type { SeedanceResolution } from "./types";
import {
  SEEDANCE_25_ASPECT_RATIOS,
  SEEDANCE_25_LIMITS,
  SEEDANCE_25_MODES,
  type Seedance25AspectRatio,
  type Seedance25Mode,
} from "./v25/types";

export type { QualityTier, SeedanceEngine };

// ── Engine ids ───────────────────────────────────────────────

export const SEEDANCE_ENGINE_IDS = ["2.0", "2.5"] as const;

/** D1: Seedance 2.5 is the default for new jobs. */
export const DEFAULT_ENGINE: SeedanceEngine = "2.5";

export function isSeedanceEngine(value: unknown): value is SeedanceEngine {
  return value === "2.0" || value === "2.5";
}

// ── Base URLs ────────────────────────────────────────────────

/** 2.0 default; overridable via ENHANCOR_API_BASE_URL (existing behaviour). */
export const SEEDANCE_20_API_BASE_DEFAULT =
  "https://apireq.enhancor.ai/api/enhancor-ugc-full-access/v1";

/** 2.5 is hard-coded on purpose (no env override) — proven by the POC. */
export const SEEDANCE_25_API_BASE = "https://apireq.enhancor.ai/api/seedance2.5/v1";

// ── 2.0 modes ────────────────────────────────────────────────

/**
 * 2.0 modes as the app names them. `text_to_video` is expressed on the 2.0
 * wire as `type: "text-to-video"` with no `mode` field (see client.ts).
 */
export const SEEDANCE_20_MODES = [
  "ugc",
  "multi_reference",
  "multi_frame",
  "lipsyncing",
  "first_n_last_frames",
  "text_to_video",
] as const;
export type Seedance20Mode = (typeof SEEDANCE_20_MODES)[number];

/**
 * Only the four ratios the 2.0 wizard can actually render. `1:1` and `21:9` are
 * deliberately absent: they exist on 2.5, and if they stayed here a 2.5 → 2.0
 * engine switch would keep a ratio the 2.0 UI has no button for, leaving the
 * control with nothing selected.
 */
export const SEEDANCE_20_ASPECT_RATIOS = ["9:16", "16:9", "3:4", "4:3"] as const;

// ── Capability model ─────────────────────────────────────────

export interface EngineCapabilities {
  /** Modes the engine accepts (app-level names). */
  modes: readonly string[];
  durationMin: number;
  durationMax: number;
  /** `duration: -1` accepted. */
  supportsAutoDuration: boolean;
  aspectRatios: readonly string[];
  supportsPassFaces: boolean; // 2.5 `pass_faces` (2.0 equivalent is `full_access`)
  supportsIsUncensored: boolean; // 2.5 `is_uncensored`
  supportsOutputFormat: boolean; // 2.5 `output_format`
  supportsBitrateMode: boolean; // 2.5 `bitrate_mode`
  supportsFastMode: boolean; // 2.0 only
  supportsQuality: boolean; // 2.0 `quality` (dropped by the 2.0 allow-list today)
  maxImages: number;
  maxVideos: number;
  maxAudios: number;
  /** ugc: products + influencers combined cap. */
  maxUgcRefs: number;
  /** Whether webhook_url is mandatory on /queue. */
  webhookRequired: boolean;
  /** NEVER retry /queue on 2.5 (double billing). 2.0 keeps its legacy one-retry. */
  retryQueue: boolean;
  /** Provider reports actual `cost` (credits) on completion. */
  reportsCost: boolean;
}

export interface SeedanceEngineSpec {
  id: SeedanceEngine;
  /** e.g. "Seedance 2.5" */
  label: string;
  /** e.g. "2.5" */
  shortLabel: string;
  description: string;
  /** Resolved at call time so env overrides + tests work. */
  getApiBase: () => string;
  capabilities: EngineCapabilities;
}

export const SEEDANCE_ENGINES: Record<SeedanceEngine, SeedanceEngineSpec> = {
  "2.0": {
    id: "2.0",
    label: "Seedance 2.0",
    shortLabel: "2.0",
    description: "Legacy Enhancor UGC Full Access endpoint. 4–15 s clips.",
    getApiBase: () => process.env.ENHANCOR_API_BASE_URL ?? SEEDANCE_20_API_BASE_DEFAULT,
    capabilities: {
      modes: SEEDANCE_20_MODES,
      durationMin: 4,
      durationMax: 15,
      supportsAutoDuration: false,
      aspectRatios: SEEDANCE_20_ASPECT_RATIOS,
      supportsPassFaces: true,
      supportsIsUncensored: false,
      supportsOutputFormat: false,
      supportsBitrateMode: false,
      supportsFastMode: true,
      supportsQuality: true,
      maxImages: 9,
      maxVideos: 9,
      maxAudios: 9,
      maxUgcRefs: 9,
      webhookRequired: false,
      retryQueue: true,
      reportsCost: false,
    },
  },
  "2.5": {
    id: "2.5",
    label: "Seedance 2.5",
    shortLabel: "2.5",
    description:
      "Enhancor Seedance 2.5 Unrestricted. Nine modes, 4–30 s or Auto, real per-second credit pricing.",
    getApiBase: () => SEEDANCE_25_API_BASE,
    capabilities: {
      modes: SEEDANCE_25_MODES,
      durationMin: SEEDANCE_25_LIMITS.durationMin,
      durationMax: SEEDANCE_25_LIMITS.durationMax,
      supportsAutoDuration: true,
      aspectRatios: SEEDANCE_25_ASPECT_RATIOS,
      supportsPassFaces: true,
      supportsIsUncensored: true,
      supportsOutputFormat: true,
      supportsBitrateMode: true,
      supportsFastMode: false,
      supportsQuality: false,
      maxImages: SEEDANCE_25_LIMITS.maxImages,
      maxVideos: SEEDANCE_25_LIMITS.maxVideos,
      maxAudios: SEEDANCE_25_LIMITS.maxAudios,
      maxUgcRefs: SEEDANCE_25_LIMITS.maxUgcRefs,
      webhookRequired: true,
      retryQueue: false,
      reportsCost: true,
    },
  },
};

export function getEngine(id: SeedanceEngine): SeedanceEngineSpec {
  return SEEDANCE_ENGINES[id];
}

/** Human label; tolerates null/undefined (pre-migration rows) → "Seedance 2.0". */
export function engineLabel(engine: SeedanceEngine | null | undefined): string {
  return SEEDANCE_ENGINES[engine ?? "2.0"].label;
}

export function engineSupportsMode(engine: SeedanceEngine, mode: string): boolean {
  return SEEDANCE_ENGINES[engine].capabilities.modes.includes(mode);
}

export function engineSupportsAspectRatio(engine: SeedanceEngine, ratio: string): boolean {
  return SEEDANCE_ENGINES[engine].capabilities.aspectRatios.includes(ratio);
}

/**
 * True when `duration` is legal for the engine: within [min,max], or -1 when
 * the engine supports Auto.
 */
export function isDurationValidForEngine(engine: SeedanceEngine, duration: number): boolean {
  const c = SEEDANCE_ENGINES[engine].capabilities;
  if (duration === -1) return c.supportsAutoDuration;
  return Number.isInteger(duration) && duration >= c.durationMin && duration <= c.durationMax;
}

// ── Quality tiers (D3) ───────────────────────────────────────

export const QUALITY_TIER_IDS = ["draft-480p", "draft-720p", "final-1080p"] as const;

export interface QualityTierSpec {
  id: QualityTier;
  label: string;
  kind: "draft" | "final";
  resolution: SeedanceResolution;
  description: string;
}

export const QUALITY_TIERS: Record<QualityTier, QualityTierSpec> = {
  "draft-480p": {
    id: "draft-480p",
    label: "Draft 480p",
    kind: "draft",
    resolution: "480p",
    description: "Cheapest — quick idea checks.",
  },
  "draft-720p": {
    id: "draft-720p",
    label: "Draft 720p",
    kind: "draft",
    resolution: "720p",
    description: "Default — good enough to judge the take.",
  },
  "final-1080p": {
    id: "final-1080p",
    label: "Final 1080p",
    kind: "final",
    resolution: "1080p",
    description: "Full quality for publishing.",
  },
};

/** D3: Draft 720p is the default tier. */
export const DEFAULT_QUALITY_TIER: QualityTier = "draft-720p";

export function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === "string" && (QUALITY_TIER_IDS as readonly string[]).includes(value);
}

export function qualityTierToResolution(tier: QualityTier): SeedanceResolution {
  return QUALITY_TIERS[tier].resolution;
}

export function resolutionToQualityTier(resolution: SeedanceResolution): QualityTier {
  switch (resolution) {
    case "480p":
      return "draft-480p";
    case "1080p":
      return "final-1080p";
    default:
      return "draft-720p";
  }
}

/** A finished draft can be re-rendered as Final (D3). */
export function isDraftTier(tier: QualityTier | null | undefined): boolean {
  return tier === "draft-480p" || tier === "draft-720p";
}

// ── Aspect ratio helpers shared by UI + schema ───────────────

/** Default aspect for CocoLash (TikTok/Reels). Enhancor's own default is 16:9. */
export const DEFAULT_ASPECT_RATIO: Seedance25AspectRatio = "9:16";

/** D5/D10 default clip length for new 2.5 jobs (Enhancor's own default is 10). */
export const DEFAULT_DURATION_SECONDS = 8;

/** Modes whose output aspect follows the input; the UI locks the control. */
export function isAdaptiveOnlyMode(mode: Seedance25Mode | string): boolean {
  return mode === "edit" || mode === "extend" || mode === "first_n_last_frames";
}
