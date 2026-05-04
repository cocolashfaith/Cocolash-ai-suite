"use client";

import { cn } from "@/lib/utils";
import type { SeedanceV4WizardState } from "./types";

/**
 * Enhancor settings panel — used in Step 3 (Prompt Review) for EVERY mode.
 *
 * Shows the user the per-generation parameters Enhancor accepts:
 *   - Resolution (480p / 720p / 1080p) — matrix-aware (1080p disables Fast Mode)
 *   - Aspect ratio (9:16, 16:9, 3:4, 4:3) — Enhancor-allowed only, verified by curl
 *   - Fast Mode (auto-disabled at 1080p per Enhancor docs)
 *   - Duration override
 *
 * 1:1 / 21:9 / 4:5 are NOT shown — Enhancor rejects them at every resolution
 * (verified 2026-05-04 via curl probe, see .planning/phases/14-audit/evidence/).
 */

const RESOLUTIONS = [
  { value: "480p" as const, label: "480p", desc: "Fastest" },
  { value: "720p" as const, label: "720p", desc: "Recommended" },
  { value: "1080p" as const, label: "1080p", desc: "Highest quality" },
];

const ASPECT_RATIOS = [
  { value: "9:16" as const, label: "9:16", desc: "TikTok / Reels" },
  { value: "16:9" as const, label: "16:9", desc: "Landscape" },
  { value: "3:4" as const, label: "3:4", desc: "Portrait" },
  { value: "4:3" as const, label: "4:3", desc: "Classic" },
];

const DURATIONS = [
  { value: 5, label: "5s" },
  { value: 8, label: "8s" },
  { value: 10, label: "10s" },
  { value: 15, label: "15s" },
];

interface EnhancorSettingsPanelProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  /** When true (lip-sync mode), the duration row is hidden — Enhancor derives
   *  duration from the audio file. */
  hideDuration?: boolean;
  /** Multi-frame mode hides the top-level duration since segment durations sum. */
  hideTopLevelDuration?: boolean;
}

export function EnhancorSettingsPanel({
  state,
  setState,
  hideDuration,
  hideTopLevelDuration,
}: EnhancorSettingsPanelProps) {
  const fastModeDisabled = state.resolution === "1080p";

  return (
    <section className="space-y-4 rounded-xl border-2 border-coco-beige-dark bg-coco-beige-light/30 p-4">
      <div>
        <h3 className="text-sm font-semibold text-coco-brown">
          Generation settings
        </h3>
        <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
          Enhancor parameters for this generation. Defaults are sensible; tweak
          before clicking Approve &amp; Generate.
        </p>
      </div>

      {/* Resolution */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-coco-brown">Resolution</label>
        <div className="grid grid-cols-3 gap-2">
          {RESOLUTIONS.map((r) => {
            const active = state.resolution === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setState({ resolution: r.value })}
                className={cn(
                  "rounded-lg border-2 px-3 py-2 text-center transition-all",
                  active
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                <p
                  className={cn(
                    "text-sm font-bold",
                    active ? "text-coco-golden" : "text-coco-brown-medium"
                  )}
                >
                  {r.label}
                </p>
                <p className="text-[10px] text-coco-brown-medium/60">{r.desc}</p>
              </button>
            );
          })}
        </div>
        {state.resolution === "1080p" && (
          <p className="text-[11px] text-coco-brown-medium/60">
            1080p disables Fast Mode (per Enhancor) but supports all 4 aspect ratios.
          </p>
        )}
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-coco-brown">
          Aspect ratio
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ASPECT_RATIOS.map((ar) => {
            const active = state.aspectRatio === ar.value;
            return (
              <button
                key={ar.value}
                type="button"
                onClick={() => setState({ aspectRatio: ar.value })}
                className={cn(
                  "rounded-lg border-2 px-3 py-2 text-center transition-all",
                  active
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                <p
                  className={cn(
                    "text-sm font-bold",
                    active ? "text-coco-golden" : "text-coco-brown-medium"
                  )}
                >
                  {ar.label}
                </p>
                <p className="text-[10px] text-coco-brown-medium/60">{ar.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration */}
      {!hideDuration && !hideTopLevelDuration && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-coco-brown">
            Clip duration
          </label>
          <div className="grid grid-cols-4 gap-2">
            {DURATIONS.map((d) => {
              const active = state.duration === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={() => setState({ duration: d.value as any })}
                  className={cn(
                    "rounded-lg border-2 px-3 py-2 text-center transition-all",
                    active
                      ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                      : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                  )}
                >
                  <p
                    className={cn(
                      "text-sm font-bold",
                      active ? "text-coco-golden" : "text-coco-brown-medium"
                    )}
                  >
                    {d.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hideTopLevelDuration && (
        <p className="text-[11px] text-coco-brown-medium/60">
          Multi-frame: duration is the sum of your individual segment durations
          (4–15 s total).
        </p>
      )}
      {hideDuration && (
        <p className="text-[11px] text-coco-brown-medium/60">
          Lip-sync: duration is derived from your uploaded audio.
        </p>
      )}

      {/* Fast Mode */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-coco-brown">Fast Mode</p>
          <p className="text-[11px] text-coco-brown-medium/60">
            Faster generation, slightly lower quality. Enhancor disables this at
            1080p.
          </p>
        </div>
        <button
          type="button"
          disabled={fastModeDisabled}
          onClick={() => setState({ fastMode: !state.fastMode })}
          className={cn(
            "flex h-5 w-9 items-center rounded-full transition-colors",
            state.fastMode && !fastModeDisabled
              ? "bg-coco-golden"
              : "bg-coco-beige-dark",
            fastModeDisabled && "opacity-40"
          )}
          aria-pressed={state.fastMode && !fastModeDisabled}
        >
          <div
            className={cn(
              "h-4 w-4 rounded-full bg-white shadow transition-transform",
              state.fastMode && !fastModeDisabled
                ? "translate-x-4"
                : "translate-x-0.5"
            )}
          />
        </button>
      </div>
    </section>
  );
}
