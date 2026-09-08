"use client";

import { ChevronDown, Info, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  QUALITY_TIERS,
  QUALITY_TIER_IDS,
  SEEDANCE_ENGINES,
  isAdaptiveOnlyMode,
  qualityTierToResolution,
  type QualityTier,
} from "@/lib/seedance/engines";
import {
  SEEDANCE_25_ASPECT_RATIOS,
  SEEDANCE_25_BITRATE_MODES,
  SEEDANCE_25_LIMITS,
  type Seedance25AspectRatio,
  type Seedance25BitrateMode,
  type Seedance25OutputFormat,
} from "@/lib/seedance/v25/types";
import { estimateCredits, formatUsd } from "@/lib/seedance/pricing";
import { useVideoSettings } from "@/lib/settings/use-video-settings";
import { defaultOutputFormatFor, effectiveDuration } from "./lib/mode-input-rules";
import type { SeedanceV4WizardState } from "./types";

interface OutputSettingsPanelProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
}

const ASPECT_HINTS: Record<Seedance25AspectRatio, string> = {
  "21:9": "Cinematic",
  "16:9": "Landscape",
  "4:3": "Classic",
  "1:1": "Square",
  "3:4": "Portrait",
  "9:16": "TikTok / Reels",
  adaptive: "Follows input",
};

/**
 * Step-1 output settings (D3, D9, D10).
 *
 * Seedance 2.5 → quality tiers (Draft 480p / Draft 720p / Final 1080p) with a
 * live ≈$ preview per tier, a 4–30 s duration slider with an "Auto" toggle,
 * all seven aspect ratios, and a collapsed "Advanced" block for pass_faces,
 * is_uncensored, output_format and bitrate_mode.
 *
 * Seedance 2.0 → the legacy controls exactly as they behaved before
 * (4–15 s select, quality, resolution, four aspects, Pass Faces, Unrestricted).
 */
export function OutputSettingsPanel({ state, setState }: OutputSettingsPanelProps) {
  const { settings } = useVideoSettings();

  if (state.engine === "2.0") {
    return <LegacySettings state={state} setState={setState} />;
  }

  const caps = SEEDANCE_ENGINES["2.5"].capabilities;
  const isEdit = state.mode === "edit";
  const isMultiFrame = state.mode === "multi_frame";
  const aspectLocked = isAdaptiveOnlyMode(state.mode);
  const autoDuration = isEdit || state.durationMode === "auto";
  const durationForEstimate = effectiveDuration(state);

  const tierPreview = (tier: QualityTier) =>
    estimateCredits({
      engine: "2.5",
      mode: state.mode,
      resolution: qualityTierToResolution(tier),
      durationSeconds: durationForEstimate,
      hasVideoInputs: (state.inputVideoUrls?.length ?? 0) > 0,
      isUncensored: state.isUncensored,
      multiFrameDurations: state.directorMultiFramePrompts?.map((p) => p.duration),
      rates: settings.rates,
      usdPerCredit: settings.usd_per_credit,
    });

  function setTier(tier: QualityTier) {
    setState({ qualityTier: tier, resolution: qualityTierToResolution(tier) });
  }

  return (
    <section className="space-y-4 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold text-coco-brown">Output</label>
        <p className="text-[11px] text-coco-brown-medium/60">
          Quality, length and shape of the finished clip.
        </p>
      </div>

      {/* ── Quality tier ───────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-coco-brown">Quality</label>
        <div className="grid grid-cols-3 gap-2">
          {QUALITY_TIER_IDS.map((id) => {
            const tier = QUALITY_TIERS[id];
            const active = state.qualityTier === id;
            const preview = tierPreview(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTier(id)}
                aria-pressed={active}
                className={cn(
                  "rounded-lg border-2 px-3 py-2 text-center transition-all",
                  active
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                <p
                  className={cn(
                    "text-xs font-bold",
                    active ? "text-coco-golden" : "text-coco-brown-medium"
                  )}
                >
                  {tier.label}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold text-coco-brown">
                  ≈ {formatUsd(preview.usd)}
                </p>
                <p className="text-[9px] leading-tight text-coco-brown-medium/60">
                  {tier.description}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-coco-brown-medium/50">
          Estimated for {durationPreviewLabel(durationForEstimate)}
          {state.isUncensored ? " at the uncensored rate" : ""}. Every finished Draft can be
          re-rendered as Final 1080p from the gallery.
        </p>
      </div>

      {/* ── Duration ───────────────────────────────────────── */}
      {isMultiFrame ? (
        <div className="flex items-start gap-2 rounded-lg border border-coco-beige-dark bg-coco-beige-light/40 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coco-brown-medium/50" />
          <p className="text-[11px] text-coco-brown-medium/70">
            Multi-Frame length is the <strong>sum of your segment durations</strong> (4–30 s
            total), set in Step 3.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-semibold text-coco-brown">
              Duration{" "}
              <span className="font-normal text-coco-brown-medium/60">
                {autoDuration ? "— Auto" : `— ${state.duration}s`}
              </span>
            </label>
            <button
              type="button"
              disabled={isEdit}
              onClick={() =>
                setState({ durationMode: state.durationMode === "auto" ? "fixed" : "auto" })
              }
              aria-pressed={autoDuration}
              className={cn(
                "flex items-center gap-2 rounded-lg border-2 px-2.5 py-1 text-[11px] font-medium transition-all",
                autoDuration
                  ? "border-coco-golden bg-coco-golden/10 text-coco-golden"
                  : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40",
                isEdit && "cursor-not-allowed opacity-70"
              )}
            >
              {isEdit && <Lock className="h-3 w-3" />}
              Auto
            </button>
          </div>
          <Slider
            value={[state.duration]}
            min={caps.durationMin}
            max={caps.durationMax}
            step={1}
            disabled={autoDuration}
            onValueChange={(v) => setState({ duration: v[0] ?? state.duration })}
            aria-label="Clip duration in seconds"
          />
          <div className="flex justify-between text-[10px] text-coco-brown-medium/50">
            <span>{caps.durationMin}s</span>
            <span>
              {isEdit
                ? "Edit mode always runs on Auto — Seedance keeps the source length."
                : autoDuration
                ? `Seedance picks the length (billed on the real output; ≈${SEEDANCE_25_LIMITS.durationMin}–${SEEDANCE_25_LIMITS.durationMax}s).`
                : "Drag to set the clip length."}
            </span>
            <span>{caps.durationMax}s</span>
          </div>
        </div>
      )}

      {/* ── Aspect ratio ───────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-coco-brown">Aspect ratio</label>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {SEEDANCE_25_ASPECT_RATIOS.map((ratio) => {
            const active = state.aspectRatio === ratio;
            const disabled = aspectLocked && ratio !== "adaptive";
            return (
              <button
                key={ratio}
                type="button"
                disabled={disabled}
                onClick={() => setState({ aspectRatio: ratio })}
                aria-pressed={active}
                className={cn(
                  "rounded-lg border-2 px-1.5 py-2 text-center transition-all",
                  active
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40",
                  disabled && "cursor-not-allowed opacity-40 hover:border-coco-beige-dark"
                )}
              >
                <p
                  className={cn(
                    "text-[11px] font-bold",
                    active ? "text-coco-golden" : "text-coco-brown-medium"
                  )}
                >
                  {ratio === "adaptive" ? "Auto" : ratio}
                </p>
                <p className="text-[9px] leading-tight text-coco-brown-medium/60">
                  {ASPECT_HINTS[ratio]}
                </p>
              </button>
            );
          })}
        </div>
        {aspectLocked && (
          <p className="text-[10px] text-coco-brown-medium/60">
            This mode always outputs <strong>adaptive</strong> — the shape follows your source
            {state.mode === "first_n_last_frames" ? " frame" : " video"}.
          </p>
        )}
      </div>

      {/* ── Advanced ───────────────────────────────────────── */}
      <Collapsible className="border-t border-coco-beige-dark/30 pt-3">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left">
          <span className="text-xs font-semibold text-coco-brown">Advanced</span>
          <span className="flex items-center gap-1 text-[10px] text-coco-brown-medium/50">
            Faces, NSFW, format, bitrate
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <ToggleRow
            label="Pass faces"
            hint="Let Seedance carry the faces from your reference images into the video."
            checked={state.passFaces}
            onChange={(v) => setState({ passFaces: v })}
          />
          <ToggleRow
            label="Unrestricted content (NSFW)"
            hint={
              state.isUncensored
                ? "Billed at the uncensored credit rate (~1% more per second)."
                : "Allows adult content. Billed at the uncensored credit rate."
            }
            checked={state.isUncensored}
            onChange={(v) => setState({ isUncensored: v })}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="output-format"
                className="mb-1 block text-[11px] font-medium text-coco-brown-medium"
              >
                Output format
              </label>
              <select
                id="output-format"
                value={state.outputFormat ?? ""}
                onChange={(e) =>
                  setState({
                    outputFormat: e.target.value
                      ? (e.target.value as Seedance25OutputFormat)
                      : undefined,
                  })
                }
                className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-xs text-coco-brown transition-all focus:border-coco-golden"
              >
                <option value="">
                  Engine default (.{defaultOutputFormatFor(state.mode)})
                </option>
                <option value="mp4">.mp4</option>
                <option value="mov">.mov</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="bitrate-mode"
                className="mb-1 block text-[11px] font-medium text-coco-brown-medium"
              >
                Bitrate
              </label>
              <select
                id="bitrate-mode"
                value={state.bitrateMode}
                onChange={(e) =>
                  setState({ bitrateMode: e.target.value as Seedance25BitrateMode })
                }
                className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-xs capitalize text-coco-brown transition-all focus:border-coco-golden"
              >
                {SEEDANCE_25_BITRATE_MODES.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m === "standard" ? "Standard" : "High"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function durationPreviewLabel(durationSeconds: number): string {
  return durationSeconds === -1 ? "an assumed 10 s (Auto)" : `${durationSeconds}s`;
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold text-coco-brown">{label}</p>
        <p className="text-[11px] text-coco-brown-medium/60">{hint}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        aria-label={label}
        className={cn(
          "flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-coco-golden" : "bg-coco-beige-dark"
        )}
      >
        <div
          className={cn(
            "h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

/* ── Seedance 2.0 (legacy) controls — behaviour unchanged ─────────────── */

function LegacySettings({ state, setState }: OutputSettingsPanelProps) {
  return (
    <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold text-coco-brown">Video Settings</label>
        <p className="text-[11px] text-coco-brown-medium/60">
          Seedance 2.0 — 4–15 s clips, four aspect ratios.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="duration"
            className="mb-1 block text-xs font-medium text-coco-brown-medium"
          >
            Duration (seconds)
          </label>
          <select
            id="duration"
            value={state.duration ?? 15}
            onChange={(e) => setState({ duration: parseInt(e.target.value) })}
            className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-sm text-coco-brown transition-all focus:border-coco-golden"
          >
            {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="quality"
            className="mb-1 block text-xs font-medium text-coco-brown-medium"
          >
            Quality
          </label>
          <select
            id="quality"
            value={state.quality ?? "standard"}
            onChange={(e) => setState({ quality: e.target.value })}
            className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-sm text-coco-brown transition-all focus:border-coco-golden"
          >
            <option value="standard">Standard</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="resolution"
            className="mb-1 block text-xs font-medium text-coco-brown-medium"
          >
            Resolution
          </label>
          <select
            id="resolution"
            value={state.resolution ?? "720p"}
            onChange={(e) =>
              setState({ resolution: e.target.value as "480p" | "720p" | "1080p" })
            }
            className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-sm text-coco-brown transition-all focus:border-coco-golden"
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="aspectRatio"
            className="mb-1 block text-xs font-medium text-coco-brown-medium"
          >
            Aspect Ratio
          </label>
          <select
            id="aspectRatio"
            value={state.aspectRatio ?? "9:16"}
            onChange={(e) =>
              setState({ aspectRatio: e.target.value as Seedance25AspectRatio })
            }
            className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-sm text-coco-brown transition-all focus:border-coco-golden"
          >
            <option value="9:16">9:16 (Vertical)</option>
            <option value="16:9">16:9 (Horizontal)</option>
            <option value="3:4">3:4</option>
            <option value="4:3">4:3</option>
          </select>
        </div>
      </div>

      <div className="space-y-2 border-t border-coco-beige-dark/30 pt-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={state.fullAccess ?? true}
            onChange={(e) => setState({ fullAccess: e.target.checked })}
            className="h-4 w-4 rounded border-2 border-coco-beige-dark/50 bg-white text-coco-golden accent-coco-golden"
          />
          <span className="text-sm font-medium text-coco-brown">Pass Faces</span>
          <span className="text-[11px] text-coco-brown-medium/60">
            Allow face recognition in the video
          </span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={state.unrestricted ?? false}
            onChange={(e) => setState({ unrestricted: e.target.checked })}
            className="h-4 w-4 rounded border-2 border-coco-beige-dark/50 bg-white text-coco-golden accent-coco-golden"
          />
          <span className="text-sm font-medium text-coco-brown">Unrestricted</span>
          <span className="text-[11px] text-coco-brown-medium/60">
            Unlock advanced generation features
          </span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={state.fastMode ?? false}
            disabled={state.resolution === "1080p"}
            onChange={(e) => setState({ fastMode: e.target.checked })}
            className="h-4 w-4 rounded border-2 border-coco-beige-dark/50 bg-white text-coco-golden accent-coco-golden disabled:opacity-40"
          />
          <span className="text-sm font-medium text-coco-brown">Fast Mode</span>
          <span className="text-[11px] text-coco-brown-medium/60">
            Faster, slightly lower quality. Disabled at 1080p.
          </span>
        </label>
      </div>
    </section>
  );
}
