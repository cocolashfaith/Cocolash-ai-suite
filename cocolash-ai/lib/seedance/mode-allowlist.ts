/**
 * Seedance Mode Allow-List
 *
 * Encodes the Enhancor capability matrix as per-mode allow-lists.
 * Used at two enforcement points:
 * 1. /api/seedance/generate — rejects disallowed fields with 400
 * 2. lib/seedance/client.ts — drops disallowed fields before submission (defense in depth)
 *
 * Source of truth: .planning/research/enhancor-capability-matrix.md
 */

import type { SeedanceMode } from "./types";

interface ModeAllowListConfig {
  required: readonly string[];
  optional: readonly string[];
}

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
 * Universal fields that are always allowed regardless of mode.
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

/**
 * Get all allowed field names for a mode (required + optional + universal).
 */
export function getAllowedFieldsForMode(mode: SeedanceMode | "text_to_video"): Set<string> {
  const allowList = mode === "text_to_video" ? TEXT_TO_VIDEO_ALLOWLIST : MODE_ALLOWLIST[mode];

  const allowed = new Set<string>([
    ...allowList.required,
    ...allowList.optional,
    ...UNIVERSAL_FIELDS,
  ]);

  return allowed;
}

/**
 * Check if a field is allowed for a given mode.
 * Returns the field name if disallowed, or null if allowed.
 */
export function getDisallowedFields(
  input: Record<string, unknown>,
  mode: SeedanceMode | "text_to_video"
): string[] {
  const allowed = getAllowedFieldsForMode(mode);
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
  mode: SeedanceMode | "text_to_video"
): Record<string, unknown> {
  const allowed = getAllowedFieldsForMode(mode);

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
export function getAllowedFieldsList(mode: SeedanceMode | "text_to_video"): string {
  const allowed = getAllowedFieldsForMode(mode);
  return Array.from(allowed).sort().join(", ");
}
