/**
 * Global video defaults + pricing (D4/D5) — ONE row in `video_settings`
 * (created by supabase/migrations/20260908_seedance25.sql).
 *
 *   default_engine        "2.0" | "2.5"                 (D1: 2.5)
 *   default_quality_tier  draft-480p | draft-720p | final-1080p   (D3: draft-720p)
 *   default_duration      4–30 or -1 (Auto)             (8)
 *   default_aspect_ratio  Enhancor 2.5 aspect            (9:16)
 *   usd_per_credit        NUMERIC, default 0.001
 *   rates                 JSONB Seedance25RateTable (seeded from lib/seedance/pricing.ts)
 *
 * Reads never throw: a missing table (migration not applied) or a missing
 * row falls back to DEFAULT_VIDEO_SETTINGS so the wizard and the estimator
 * keep working. Writes happen only in PATCH /api/settings/video (admin).
 *
 * This module is client-safe: it only imports zod, types and pure helpers.
 * Pass an already-created Supabase client (service role on the server).
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QualityTier, SeedanceEngine } from "@/lib/types";
import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_ENGINE,
  DEFAULT_QUALITY_TIER,
  QUALITY_TIER_IDS,
  SEEDANCE_ENGINE_IDS,
  isQualityTier,
  isSeedanceEngine,
} from "@/lib/seedance/engines";
import {
  SEEDANCE_25_RATES_DEFAULT,
  USD_PER_CREDIT_DEFAULT,
  coerceRateTable,
  type Seedance25RateTable,
} from "@/lib/seedance/pricing";
import {
  AUTO_DURATION,
  SEEDANCE_25_ASPECT_RATIOS,
  SEEDANCE_25_LIMITS,
  type Seedance25AspectRatio,
} from "@/lib/seedance/v25/types";
import { isMissingTableError } from "@/lib/supabase/schema-errors";

export const VIDEO_SETTINGS_TABLE = "video_settings";

/** Fixed id of the singleton row (chat_settings uses …0001; this is …0002). */
export const VIDEO_SETTINGS_SINGLETON_ID = "00000000-0000-0000-0000-000000000002";

export interface VideoSettings {
  id: string;
  default_engine: SeedanceEngine;
  default_quality_tier: QualityTier;
  /** 4–30 or -1 (Auto). */
  default_duration: number;
  default_aspect_ratio: Seedance25AspectRatio;
  usd_per_credit: number;
  rates: Seedance25RateTable;
  updated_at: string;
  updated_by: string | null;
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  id: VIDEO_SETTINGS_SINGLETON_ID,
  default_engine: DEFAULT_ENGINE,
  default_quality_tier: DEFAULT_QUALITY_TIER,
  default_duration: DEFAULT_DURATION_SECONDS,
  default_aspect_ratio: "9:16",
  usd_per_credit: USD_PER_CREDIT_DEFAULT,
  rates: SEEDANCE_25_RATES_DEFAULT,
  updated_at: "1970-01-01T00:00:00.000Z",
  updated_by: null,
};

// ── PATCH schema (admin edits) ───────────────────────────────

const CreditRateSchema = z.object({
  standard: z.number().positive().max(100_000),
  uncensored: z.number().positive().max(100_000),
});

const RateResolutionTableSchema = z.object({
  "480p": CreditRateSchema,
  "720p": CreditRateSchema,
  "1080p": CreditRateSchema,
});

export const RateTableSchema = z.object({
  standard: RateResolutionTableSchema,
  reduced: RateResolutionTableSchema,
});

/**
 * Body of PATCH /api/settings/video. Every key optional; unknown keys are
 * REJECTED (strict) so a typo cannot silently no-op.
 */
export const VideoSettingsSchema = z
  .object({
    default_engine: z.enum(SEEDANCE_ENGINE_IDS).optional(),
    default_quality_tier: z.enum(QUALITY_TIER_IDS).optional(),
    default_duration: z
      .number()
      .int()
      .refine(
        (d) =>
          d === AUTO_DURATION ||
          (d >= SEEDANCE_25_LIMITS.durationMin && d <= SEEDANCE_25_LIMITS.durationMax),
        { message: "default_duration must be 4–30 or -1 (Auto)" }
      )
      .optional(),
    default_aspect_ratio: z.enum(SEEDANCE_25_ASPECT_RATIOS).optional(),
    usd_per_credit: z.number().positive().max(1).optional(),
    rates: RateTableSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "No valid fields to update",
  });

export type VideoSettingsPatch = z.output<typeof VideoSettingsSchema>;

// ── Row → VideoSettings (tolerant) ───────────────────────────

/**
 * Coerce a raw DB row (NUMERIC arrives as string, JSONB as object) into a
 * fully-populated VideoSettings, filling any missing/invalid field from the
 * defaults. Never throws.
 */
export function mergeVideoSettings(row: Partial<Record<keyof VideoSettings, unknown>> | null | undefined): VideoSettings {
  if (!row) return DEFAULT_VIDEO_SETTINGS;
  const d = DEFAULT_VIDEO_SETTINGS;

  const duration = Number(row.default_duration);
  const durationOk =
    Number.isInteger(duration) &&
    (duration === AUTO_DURATION ||
      (duration >= SEEDANCE_25_LIMITS.durationMin && duration <= SEEDANCE_25_LIMITS.durationMax));

  const usdPerCredit = Number(row.usd_per_credit);
  const aspect = row.default_aspect_ratio;

  return {
    id: typeof row.id === "string" ? row.id : d.id,
    default_engine: isSeedanceEngine(row.default_engine) ? row.default_engine : d.default_engine,
    default_quality_tier: isQualityTier(row.default_quality_tier)
      ? row.default_quality_tier
      : d.default_quality_tier,
    default_duration: durationOk ? duration : d.default_duration,
    default_aspect_ratio:
      typeof aspect === "string" &&
      (SEEDANCE_25_ASPECT_RATIOS as readonly string[]).includes(aspect)
        ? (aspect as Seedance25AspectRatio)
        : d.default_aspect_ratio,
    usd_per_credit:
      Number.isFinite(usdPerCredit) && usdPerCredit > 0 ? usdPerCredit : d.usd_per_credit,
    rates: coerceRateTable(row.rates) ?? d.rates,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : d.updated_at,
    updated_by: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

// ── Reads ────────────────────────────────────────────────────

export interface VideoSettingsLoadResult {
  settings: VideoSettings;
  /** false when we fell back to defaults (missing table, missing row, or query error). */
  fromDatabase: boolean;
  /** true when the table itself is missing → migration not applied. */
  missingTable: boolean;
  error?: string;
}

/**
 * Load the singleton row. Falls back to defaults on: missing table (42P01 /
 * PGRST205), missing row, or any query error. Never throws.
 */
export async function loadVideoSettings(supabase: SupabaseClient): Promise<VideoSettingsLoadResult> {
  try {
    const { data, error } = await supabase
      .from(VIDEO_SETTINGS_TABLE)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      const missingTable = isMissingTableError(error);
      if (!missingTable) console.error("[video-settings] load error:", error);
      return {
        settings: DEFAULT_VIDEO_SETTINGS,
        fromDatabase: false,
        missingTable,
        error: error.message,
      };
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) {
      return { settings: DEFAULT_VIDEO_SETTINGS, fromDatabase: false, missingTable: false };
    }

    return { settings: mergeVideoSettings(row), fromDatabase: true, missingTable: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[video-settings] load threw:", message);
    return { settings: DEFAULT_VIDEO_SETTINGS, fromDatabase: false, missingTable: false, error: message };
  }
}

/** Convenience: settings only (defaults when the table/row is missing). */
export async function getVideoSettings(supabase: SupabaseClient): Promise<VideoSettings> {
  return (await loadVideoSettings(supabase)).settings;
}

/** Shape returned by GET /api/settings/video (and consumed by useVideoSettings). */
export interface VideoSettingsResponse {
  settings: VideoSettings;
  fromDatabase: boolean;
  missingTable: boolean;
}
