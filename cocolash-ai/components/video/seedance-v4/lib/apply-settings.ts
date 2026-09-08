/**
 * Global video defaults → wizard state (D5).
 *
 * The `video_settings` singleton (engine, quality tier, duration, aspect
 * ratio) seeds a FRESH wizard. It must never stomp on a returning user's
 * localStorage state — hence `isPristineWizardState`, which the wizard uses to
 * decide whether the stored state is still "untouched defaults".
 *
 * Pure — no React, no fetch.
 */

import { qualityTierToResolution } from "@/lib/seedance/engines";
import { AUTO_DURATION, SEEDANCE_25_LIMITS } from "@/lib/seedance/v25/types";
import type { VideoSettings } from "@/lib/settings/video-settings";
import { DEFAULT_V4_STATE, type SeedanceV4WizardState } from "../types";
import { coerceStateForEngine, coerceStateForMode } from "./mode-input-rules";

/** Duration shown on the slider when the global default is Auto (-1). */
const AUTO_SLIDER_FALLBACK_SECONDS = 8;

function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return AUTO_SLIDER_FALLBACK_SECONDS;
  return Math.min(
    SEEDANCE_25_LIMITS.durationMax,
    Math.max(SEEDANCE_25_LIMITS.durationMin, Math.round(seconds))
  );
}

/**
 * Build the patch that applies the global defaults to a fresh wizard.
 *
 *  - `engine`, `qualityTier` (+ the mirrored `resolution`), `aspectRatio`
 *  - `default_duration === -1` ⇒ `durationMode: "auto"` with the slider parked
 *    at 8 s so switching back to Fixed lands somewhere sensible
 *  - `settingsApplied: true` so this only ever happens once
 *
 * The result is then run through the engine + mode coercions, so a defaults row
 * that says "2.0 / adaptive / 30 s" can never produce an illegal wizard state.
 */
export function applyVideoSettingsToState(
  state: SeedanceV4WizardState,
  settings: VideoSettings
): Partial<SeedanceV4WizardState> {
  const isAuto = settings.default_duration === AUTO_DURATION;

  const patch: Partial<SeedanceV4WizardState> = {
    engine: settings.default_engine,
    qualityTier: settings.default_quality_tier,
    resolution: qualityTierToResolution(settings.default_quality_tier),
    aspectRatio: settings.default_aspect_ratio,
    durationMode: isAuto ? "auto" : "fixed",
    duration: isAuto ? AUTO_SLIDER_FALLBACK_SECONDS : clampDuration(settings.default_duration),
    settingsApplied: true,
  };

  // Keep the §2.9 invariants no matter what the settings row says. Engine
  // first (it can force the mode back to ugc), then mode.
  const merged: SeedanceV4WizardState = { ...state, ...patch };
  const enginePatch = coerceStateForEngine(merged, merged.engine);
  const afterEngine: SeedanceV4WizardState = { ...merged, ...enginePatch };
  const modePatch = coerceStateForMode(afterEngine, afterEngine.mode);
  return { ...patch, ...enginePatch, ...modePatch };
}

/** The fields the global defaults own — the only ones pristineness looks at. */
const SEEDED_KEYS = [
  "engine",
  "qualityTier",
  "durationMode",
  "duration",
  "aspectRatio",
  "resolution",
  "mode",
] as const satisfies readonly (keyof SeedanceV4WizardState)[];

/**
 * True when the stored wizard state is still the untouched default — nothing
 * the global defaults own has been changed AND the user has not started
 * building a video (no script, no products, no uploads, no director output).
 *
 * A `true` here is the wizard's licence to apply the global defaults.
 */
export function isPristineWizardState(state: SeedanceV4WizardState): boolean {
  if (state.settingsApplied) return false;

  for (const key of SEEDED_KEYS) {
    if (state[key] !== DEFAULT_V4_STATE[key]) return false;
  }

  const hasUserContent =
    (state.scriptText ?? "").trim().length > 0 ||
    !!state.script ||
    !!state.scriptId ||
    (state.ugcProductImageUrls?.length ?? 0) > 0 ||
    (state.ugcInfluencerImageUrls?.length ?? 0) > 0 ||
    !!state.ugcInfluencerImageUrl ||
    (state.inputImageUrls?.length ?? 0) > 0 ||
    (state.inputVideoUrls?.length ?? 0) > 0 ||
    (state.inputAudioUrls?.length ?? 0) > 0 ||
    (state.multiReferenceImages?.length ?? 0) > 0 ||
    !!state.firstFrameUrl ||
    !!state.lipsyncImageUrl ||
    !!state.lipsyncAudioUrl ||
    (state.t2vSceneDescription ?? "").trim().length > 0 ||
    (state.subjectBrief ?? "").trim().length > 0 ||
    (state.editInstruction ?? "").trim().length > 0 ||
    !!state.directorPrompt;

  return !hasUserContent;
}
