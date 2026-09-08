/**
 * Mode + engine input rules for the Seedance v4 wizard (package D).
 *
 * Pure functions — no React, no fetch, no server imports — so the wizard, the
 * mode panels and the tests can all agree on ONE answer to:
 *
 *   • which modes an engine offers                (isModeAvailable)
 *   • how many of each media kind a mode accepts  (inputLimitsFor)
 *   • what resolution / duration actually ships   (effectiveResolution / effectiveDuration)
 *   • what duration the script generator gets     (effectiveScriptDuration)
 *   • whether the mode wants a script at all      (needsScript)
 *   • how to repair state when the user switches engine or mode
 *                                                 (coerceStateForEngine / coerceStateForMode)
 *
 * Source of truth for the per-mode media matrix is
 * `SEEDANCE_25_MODE_MEDIA_FIELDS` (lib/seedance/v25/schema.ts), which mirrors
 * the "Modes × media fields" table in docs/seedance-2.5/01-API-REFERENCE.md.
 */

import {
  DEFAULT_ASPECT_RATIO,
  SEEDANCE_ENGINES,
  engineSupportsAspectRatio,
  engineSupportsMode,
  isAdaptiveOnlyMode,
  qualityTierToResolution,
  type SeedanceEngine,
} from "@/lib/seedance/engines";
import { SEEDANCE_25_MODE_MEDIA_FIELDS } from "@/lib/seedance/v25/schema";
import {
  AUTO_DURATION,
  SEEDANCE_25_LIMITS,
  SEEDANCE_25_MOV_DEFAULT_MODES,
  type Seedance25Mode,
  type Seedance25OutputFormat,
} from "@/lib/seedance/v25/types";
import type { SeedanceResolution } from "@/lib/seedance/types";
import type { SeedanceV4Mode, SeedanceV4WizardState } from "../types";

/** The estimate we hand the script generator when the real length is unknown. */
export const AUTO_SCRIPT_DURATION_SECONDS = 10;

/** Modes whose whole point is a spoken/written script. The rest are optional. */
const SCRIPT_MODES: readonly SeedanceV4Mode[] = [
  "ugc",
  "multi_reference",
  "multi_frame",
  "first_n_last_frames",
];

export interface ModeInputLimits {
  /** `images[]` cap (0 ⇒ the mode does not accept images). */
  images: number;
  /** `videos[]` cap. */
  videos: number;
  /** `audios[]` cap. */
  audios: number;
  /** ugc `products[]` cap (bounded by `ugcCombined`). */
  products: number;
  /** ugc `influencers[]` cap (bounded by `ugcCombined`). */
  influencers: number;
  /** ugc: products + influencers combined cap. */
  ugcCombined: number;
  /** `lipsyncing_audio` — 1 for lipsyncing/voice_clone, else 0. */
  lipsyncingAudio: number;
  /** `first_frame_image` / `last_frame_image` — 1 each for first_n_last_frames. */
  firstLastFrame: number;
}

const EMPTY_LIMITS: ModeInputLimits = {
  images: 0,
  videos: 0,
  audios: 0,
  products: 0,
  influencers: 0,
  ugcCombined: 0,
  lipsyncingAudio: 0,
  firstLastFrame: 0,
};

/** True when the engine offers this mode (2.0 has six of the nine). */
export function isModeAvailable(engine: SeedanceEngine, mode: string): boolean {
  return engineSupportsMode(engine, mode);
}

/** Every mode the engine offers, in the canonical 2.5 order. */
export function availableModes(engine: SeedanceEngine): SeedanceV4Mode[] {
  return SEEDANCE_ENGINES[engine].capabilities.modes as SeedanceV4Mode[];
}

/**
 * How many of each media kind `mode` accepts on `engine`. Anything the mode
 * does not accept comes back as 0 so the UI can simply not render the picker.
 */
export function inputLimitsFor(engine: SeedanceEngine, mode: SeedanceV4Mode): ModeInputLimits {
  const caps = SEEDANCE_ENGINES[engine].capabilities;
  const accepted = SEEDANCE_25_MODE_MEDIA_FIELDS[mode as Seedance25Mode] ?? [];
  const accepts = (field: string) => (accepted as readonly string[]).includes(field);

  return {
    ...EMPTY_LIMITS,
    images: accepts("images") ? caps.maxImages : 0,
    videos: accepts("videos") ? caps.maxVideos : 0,
    audios: accepts("audios") ? caps.maxAudios : 0,
    products: accepts("products") ? caps.maxUgcRefs : 0,
    influencers: accepts("influencers") ? caps.maxUgcRefs : 0,
    ugcCombined: accepts("products") || accepts("influencers") ? caps.maxUgcRefs : 0,
    lipsyncingAudio: accepts("lipsyncing_audio") ? 1 : 0,
    firstLastFrame: accepts("first_frame_image") ? 1 : 0,
  };
}

/**
 * The resolution that will actually be submitted.
 * 2.5: derived from the quality tier (D3). 2.0: the user's own pick.
 */
export function effectiveResolution(state: SeedanceV4WizardState): SeedanceResolution {
  if (state.engine === "2.5") return qualityTierToResolution(state.qualityTier);
  return state.resolution;
}

/**
 * The `duration` value the request will carry.
 * `edit` is always Auto (-1, Enhancor rejects anything else); "Auto" is -1 on
 * any engine that supports it; everything else is the slider value.
 */
export function effectiveDuration(state: SeedanceV4WizardState): number {
  if (state.mode === "edit") return AUTO_DURATION;
  if (
    state.durationMode === "auto" &&
    SEEDANCE_ENGINES[state.engine].capabilities.supportsAutoDuration
  ) {
    return AUTO_DURATION;
  }
  return state.duration;
}

/**
 * The duration handed to `SeedanceScriptStep` → `POST /api/scripts`, which
 * rejects anything below 4 s. Auto / edit have no known length, so the script
 * is written for a 10 s read (the same assumption the cost estimator makes).
 */
export function effectiveScriptDuration(state: SeedanceV4WizardState): number {
  const raw = effectiveDuration(state);
  const seconds = raw === AUTO_DURATION || !Number.isFinite(raw) ? AUTO_SCRIPT_DURATION_SECONDS : raw;
  return Math.min(
    SEEDANCE_25_LIMITS.durationMax,
    Math.max(SEEDANCE_25_LIMITS.durationMin, Math.round(seconds))
  );
}

/** True when the mode is built around a script (the script section is a gate). */
export function needsScript(mode: SeedanceV4Mode): boolean {
  return SCRIPT_MODES.includes(mode);
}

/**
 * Repair the wizard state for a new engine. Returns a PATCH (always contains
 * `engine`); extra keys are exactly the things that had to change, so the
 * caller can tell the user what moved.
 *
 * 2.0 is the narrower engine: six modes, six aspect ratios, 4–15 s, no Auto.
 * Switching to 2.5 only re-mirrors `resolution` onto the quality tier (the
 * §2.9 invariant) — nothing the user chose is thrown away.
 */
export function coerceStateForEngine(
  state: SeedanceV4WizardState,
  engine: SeedanceEngine
): Partial<SeedanceV4WizardState> {
  const patch: Partial<SeedanceV4WizardState> = { engine };
  const caps = SEEDANCE_ENGINES[engine].capabilities;

  if (engine === "2.5") {
    const mirrored = qualityTierToResolution(state.qualityTier);
    if (state.resolution !== mirrored) patch.resolution = mirrored;
    return patch;
  }

  if (!engineSupportsMode(engine, state.mode)) patch.mode = "ugc";
  if (!engineSupportsAspectRatio(engine, state.aspectRatio)) {
    patch.aspectRatio = DEFAULT_ASPECT_RATIO;
  }
  if (state.duration > caps.durationMax) patch.duration = caps.durationMax;
  if (state.duration < caps.durationMin) patch.duration = caps.durationMin;
  if (!caps.supportsAutoDuration && state.durationMode !== "fixed") {
    patch.durationMode = "fixed";
  }
  return patch;
}

/**
 * Repair the wizard state for a new mode. Returns a PATCH (always contains
 * `mode`).
 *
 *  • `edit` is locked to Auto duration.
 *  • edit / extend / first_n_last_frames output follows the input → `adaptive`.
 *  • leaving one of those with `adaptive` still selected falls back to 9:16
 *    (no other mode accepts "adaptive" as a deliberate choice).
 *  • leaving `edit` releases the forced Auto so the slider works again.
 */
export function coerceStateForMode(
  state: SeedanceV4WizardState,
  mode: SeedanceV4Mode
): Partial<SeedanceV4WizardState> {
  const patch: Partial<SeedanceV4WizardState> = { mode };

  if (mode === "edit") {
    if (state.durationMode !== "auto") patch.durationMode = "auto";
  } else if (state.mode === "edit" && state.durationMode === "auto") {
    patch.durationMode = "fixed";
  }

  // 2.0 has no "adaptive" aspect — only lock it when the engine offers it.
  if (isAdaptiveOnlyMode(mode) && engineSupportsAspectRatio(state.engine, "adaptive")) {
    if (state.aspectRatio !== "adaptive") patch.aspectRatio = "adaptive";
  } else if (state.aspectRatio === "adaptive") {
    patch.aspectRatio = DEFAULT_ASPECT_RATIO;
  }

  return patch;
}

/** Enhancor's default container for the mode (mov for edit/extend, else mp4). */
export function defaultOutputFormatFor(mode: string): Seedance25OutputFormat {
  return (SEEDANCE_25_MOV_DEFAULT_MODES as readonly string[]).includes(mode) ? "mov" : "mp4";
}
