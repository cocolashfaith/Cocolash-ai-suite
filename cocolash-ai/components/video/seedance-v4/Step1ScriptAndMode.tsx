"use client";

import { SeedanceScriptStep } from "../seedance/SeedanceScriptStep";
import type { SeedanceV4WizardState } from "./types";
import type {
  CampaignType,
  ScriptTone,
  VideoDuration,
} from "@/lib/types";

// Note: UGC is the only mode offered. Mode picker is removed (D-34-13).
// Other modes are kept in code for backward compatibility but not user-facing.

interface Step1Props {
  state: SeedanceV4WizardState;
  setState: (
    update: Partial<SeedanceV4WizardState> | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onAdvance: () => void;
}

export function Step1ScriptAndMode({ state, setState, onAdvance }: Step1Props) {
  // UGC always requires a script (can be generated or provided)

  return (
    <div className="space-y-8">
      {/* ── Settings Panel (D-34-09) ──────── */}
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-sm font-semibold text-coco-brown">
            Video Settings
          </label>
          <p className="text-[11px] text-coco-brown-medium/60">
            Customize output quality and appearance.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Duration (4–15s) */}
          <div>
            <label htmlFor="duration" className="mb-1 block text-xs font-medium text-coco-brown-medium">
              Duration (seconds)
            </label>
            <select
              id="duration"
              value={state.duration ?? 15}
              onChange={(e) => setState({ duration: parseInt(e.target.value) as VideoDuration })}
              className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-sm text-coco-brown transition-all focus:border-coco-golden"
            >
              {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </select>
          </div>

          {/* Quality dropdown */}
          <div>
            <label htmlFor="quality" className="mb-1 block text-xs font-medium text-coco-brown-medium">
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

          {/* Resolution (already exists, keep) */}
          <div>
            <label htmlFor="resolution" className="mb-1 block text-xs font-medium text-coco-brown-medium">
              Resolution
            </label>
            <select
              id="resolution"
              value={state.resolution ?? "720p"}
              onChange={(e) => setState({ resolution: e.target.value as "480p" | "720p" | "1080p" })}
              className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-sm text-coco-brown transition-all focus:border-coco-golden"
            >
              <option value="480p">480p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>

          {/* Aspect Ratio (already exists, keep) */}
          <div>
            <label htmlFor="aspectRatio" className="mb-1 block text-xs font-medium text-coco-brown-medium">
              Aspect Ratio
            </label>
            <select
              id="aspectRatio"
              value={state.aspectRatio ?? "9:16"}
              onChange={(e) => setState({ aspectRatio: e.target.value as "9:16" | "16:9" | "3:4" | "4:3" })}
              className="w-full rounded-lg border-2 border-coco-beige-dark/50 bg-white px-3 py-2 text-sm text-coco-brown transition-all focus:border-coco-golden"
            >
              <option value="9:16">9:16 (Vertical)</option>
              <option value="16:9">16:9 (Horizontal)</option>
              <option value="3:4">3:4</option>
              <option value="4:3">4:3</option>
            </select>
          </div>
        </div>

        {/* Toggle settings */}
        <div className="space-y-2 border-t border-coco-beige-dark/30 pt-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={state.fullAccess ?? true}
              onChange={(e) => setState({ fullAccess: e.target.checked })}
              className="h-4 w-4 rounded border-2 border-coco-beige-dark/50 bg-white text-coco-golden accent-coco-golden"
            />
            <span className="text-sm font-medium text-coco-brown">Pass Faces</span>
            <span className="text-[11px] text-coco-brown-medium/60">Allow face recognition in the video</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={state.unrestricted ?? false}
              onChange={(e) => setState({ unrestricted: e.target.checked })}
              className="h-4 w-4 rounded border-2 border-coco-beige-dark/50 bg-white text-coco-golden accent-coco-golden"
            />
            <span className="text-sm font-medium text-coco-brown">Unrestricted</span>
            <span className="text-[11px] text-coco-brown-medium/60">Unlock advanced generation features</span>
          </label>
        </div>
      </section>

      {/* Script — required for UGC mode */}
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-sm font-semibold text-coco-brown">
            Script
          </label>
          <p className="text-[11px] text-coco-brown-medium/60">
            What the creator says in the video.
          </p>
        </div>
        <SeedanceScriptStep
          onScriptSelected={(script, meta, editedText) => {
            setState({
              script,
              scriptText: (editedText ?? script.full_script).trim(),
              scriptId: meta.scriptId,
              campaignType: meta.campaignType as CampaignType,
              tone: meta.tone as ScriptTone,
              duration: meta.duration as VideoDuration,
            });
            // Auto-advance — single-button advance UX.
            onAdvance();
          }}
        />
      </section>
    </div>
  );
}

