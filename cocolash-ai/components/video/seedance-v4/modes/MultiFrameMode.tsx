"use client";

import { UgcMode } from "./UgcMode";
import type { SeedanceV4WizardState } from "../types";

interface MultiFrameModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

/**
 * v4.1 — Multi-Frame Sequence is structurally identical to UGC at the INPUT
 * layer (avatar + product, same toggle behavior). The DIFFERENCE lives in the
 * Director: when mode === "multi_frame", the Step 3 Director call uses the
 * multi-frame system prompt (lib/ai/director/system-prompts.ts), which
 * outputs an Enhancor `multi_frame_prompts` array (per-shot prompt + duration)
 * that the user reviews segment-by-segment.
 *
 * This was the v4.0 mistake — Multi-Frame was built as multi-image-upload,
 * which is Multi-Reference's job. Multi-Frame is "UGC inputs → multi-shot
 * Director output". Faith was very explicit about this distinction.
 */
export function MultiFrameMode(props: MultiFrameModeProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-3">
        <p className="text-[11px] leading-relaxed text-coco-brown-medium">
          <strong className="text-coco-brown">Multi-Frame Sequence</strong> uses
          the same inputs as UGC (avatar + product). The difference is in the
          prompt: the Director will write a SHOT LIST (multiple per-shot prompts
          with durations) so Seedance generates a video with cuts between
          different angles while the creator speaks. Total runtime is your
          chosen duration — distributed across 2–5 shots.
        </p>
      </div>
      <UgcMode {...props} />
    </div>
  );
}
