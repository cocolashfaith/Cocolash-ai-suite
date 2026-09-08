/**
 * Seedance Mode Allow-List — ENGINE-AWARE.
 *
 * Encodes the Enhancor capability matrix as per-mode allow-lists, one table
 * per engine. Used at two enforcement points:
 *   1. /api/seedance/generate — rejects disallowed fields with 400 (2.0) /
 *      zod does this for 2.5 (lib/seedance/v25/schema.ts)
 *   2. the engine clients — drop disallowed fields before submission
 *      (defence in depth: unknown fields never reach Enhancor)
 *
 *   engine "2.0" (default) → MODE_ALLOWLIST / TEXT_TO_VIDEO_ALLOWLIST / UNIVERSAL_FIELDS
 *                            (UNCHANGED from before the 2.5 work)
 *   engine "2.5"           → MODE_ALLOWLIST_V25 / UNIVERSAL_FIELDS_V25
 *                            (docs/seedance-2.5/01-API-REFERENCE.md)
 *
 * Every helper takes an optional trailing `engine` argument defaulting to
 * "2.0" so all existing call sites keep their behaviour.
 */

import type { SeedanceEngine } from "@/lib/types";
import type { SeedanceMode } from "./types";
import type { Seedance25Mode } from "./v25/types";

interface ModeAllowListConfig {
  required: readonly string[];
  optional: readonly string[];
}

// ═══════════════════════════════════════════════════════════════
// Seedance 2.0 (legacy — do not change)
// ═══════════════════════════════════════════════════════════════

/**
 * Per-mode allow-list. "required" and "optional" fields are mode-specific.
 * Universal fields (type, mode, resolution, aspect_ratio, webhook_url, full_access, fast_mode)
 * are always allowed and not checked in the allow-list.
 */
export const MODE_ALLOWLIST: Record<SeedanceMode, ModeAllowListConfig> = {
  ugc: {
    required: ["influencers", "products"],
    optional: ["prompt", "audios", "videos", "duration"],
  },
  multi_reference: {
    required: ["images", "prompt"],
    optional: ["videos", "audios", "duration"],
  },
  multi_frame: {
    required: ["multi_frame_prompts"],
    optional: ["videos", "audios"],
  },
  lipsyncing: {
    required: ["images", "lipsyncing_audio"],
    optional: ["prompt", "videos", "duration", "audios"],
  },
  first_n_last_frames: {
    required: ["first_frame_image", "last_frame_image", "prompt"],
    optional: ["videos", "audios", "duration"],
  },
} as const;

/**
 * For text-to-video mode (which uses type: "text-to-video" with no mode field).
 */
export const TEXT_TO_VIDEO_ALLOWLIST: ModeAllowListConfig = {
  required: ["prompt"],
  optional: ["duration"],
};

/**
 * Universal fields that are always allowed regardless of mode (2.0).
 * These are not checked in the allow-list.
 */
export const UNIVERSAL_FIELDS = new Set([
  "type",
  "mode",
  "resolution",
  "aspect_ratio",
  "webhook_url",
  "full_access",
  "fast_mode",
]);

// ═══════════════════════════════════════════════════════════════
// Seedance 2.5
// ═══════════════════════════════════════════════════════════════

/**
 * 2.5 per-mode media/prompt fields (01-API-REFERENCE.md "Modes × media fields").
 * Note: ugc must NOT send videos/audios; multi_frame ignores top-level
 * prompt/duration (so they are not listed and get stripped).
 */
export const MODE_ALLOWLIST_V25: Record<Seedance25Mode, ModeAllowListConfig> = {
  ugc: {
    required: ["prompt"],
    optional: ["products", "influencers", "duration"],
  },
  text_to_video: {
    required: ["prompt"],
    optional: ["duration"],
  },
  multi_reference: {
    required: ["prompt"],
    optional: ["images", "videos", "audios", "duration"],
  },
  first_n_last_frames: {
    required: ["prompt", "first_frame_image"],
    optional: ["last_frame_image", "duration"],
  },
  multi_frame: {
    required: ["multi_frame_prompts"],
    optional: ["images", "videos", "audios"],
  },
  edit: {
    required: ["prompt", "videos"],
    optional: ["images", "audios", "duration"],
  },
  extend: {
    required: ["prompt", "videos"],
    optional: ["images", "audios", "duration"],
  },
  lipsyncing: {
    required: ["prompt", "images", "lipsyncing_audio"],
    optional: ["duration"],
  },
  voice_clone: {
    required: ["prompt", "images", "lipsyncing_audio"],
    optional: ["duration"],
  },
} as const;

/**
 * 2.5 universal fields — NO `type`, NO `full_access`, NO `fast_mode`, NO `quality`.
 * The four advanced flags (D9) are universal on 2.5.
 */
export const UNIVERSAL_FIELDS_V25 = new Set([
  "mode",
  "resolution",
  "aspect_ratio",
  "webhook_url",
  "pass_faces",
  "is_uncensored",
  "output_format",
  "bitrate_mode",
]);

// ═══════════════════════════════════════════════════════════════
// Engine-aware helpers
// ═══════════════════════════════════════════════════════════════

/** Any mode name either engine understands. */
export type AllowListMode = SeedanceMode | "text_to_video" | Seedance25Mode;

function configFor(mode: AllowListMode, engine: SeedanceEngine): ModeAllowListConfig {
  if (engine === "2.5") {
    const cfg = MODE_ALLOWLIST_V25[mode as Seedance25Mode];
    if (!cfg) throw new Error(`Unknown Seedance 2.5 mode: ${mode}`);
    return cfg;
  }
  if (mode === "text_to_video") return TEXT_TO_VIDEO_ALLOWLIST;
  const cfg = MODE_ALLOWLIST[mode as SeedanceMode];
  if (!cfg) throw new Error(`Unknown Seedance 2.0 mode: ${mode}`);
  return cfg;
}

/**
 * Get all allowed field names for a mode (required + optional + universal).
 */
export function getAllowedFieldsForMode(
  mode: AllowListMode,
  engine: SeedanceEngine = "2.0"
): Set<string> {
  const allowList = configFor(mode, engine);
  const universal = engine === "2.5" ? UNIVERSAL_FIELDS_V25 : UNIVERSAL_FIELDS;

  return new Set<string>([
    ...allowList.required,
    ...allowList.optional,
    ...universal,
  ]);
}

/**
 * Check which fields are NOT allowed for a given mode.
 * Returns the disallowed field names ([] when everything is allowed).
 */
export function getDisallowedFields(
  input: Record<string, unknown>,
  mode: AllowListMode,
  engine: SeedanceEngine = "2.0"
): string[] {
  const allowed = getAllowedFieldsForMode(mode, engine);
  const disallowed: string[] = [];

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      disallowed.push(key);
    }
  }

  return disallowed;
}

/**
 * Filter an input object to only include allowed fields for a mode.
 * Mutates nothing; returns a new object.
 */
export function pickAllowed(
  input: Record<string, unknown>,
  mode: AllowListMode,
  engine: SeedanceEngine = "2.0"
): Record<string, unknown> {
  const allowed = getAllowedFieldsForMode(mode, engine);

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (allowed.has(key)) {
      result[key] = input[key];
    }
  }

  return result;
}

/**
 * Get human-readable list of allowed fields for error messages.
 */
export function getAllowedFieldsList(
  mode: AllowListMode,
  engine: SeedanceEngine = "2.0"
): string {
  const allowed = getAllowedFieldsForMode(mode, engine);
  return Array.from(allowed).sort().join(", ");
}
