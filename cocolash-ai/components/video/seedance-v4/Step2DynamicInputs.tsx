"use client";

import type { SeedanceV4WizardState } from "./types";
import { UgcMode } from "./modes/UgcMode";
import { TextToVideoMode } from "./modes/TextToVideoMode";
import { MultiReferenceMode } from "./modes/MultiReferenceMode";
import { LipsyncMode } from "./modes/LipsyncMode";
import { MultiFrameMode } from "./modes/MultiFrameMode";
import { FirstAndLastFrameMode } from "./modes/FirstAndLastFrameMode";

interface Step2Props {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onAdvance: () => void;
}

/**
 * Step 2 dispatches to the right mode-specific input component based on
 * Step 1's `mode` choice. Each mode component is responsible for collecting
 * its own inputs into the shared wizard state and calling onReady() when
 * the user is ready to advance.
 *
 * NOTE: As of Phase 34, only UGC mode is offered to users (D-34-13).
 * Mode selector removed from Step 1; mode always set to "ugc" in initial state.
 * Other mode code paths remain for backward compatibility.
 */
export function Step2DynamicInputs({ state, setState, onAdvance }: Step2Props) {
  const props = { state, setState, onReady: onAdvance };

  // Per D-34-13: UGC is the only user-facing mode (hardcoded from Step 1)
  switch (state.mode) {
    case "ugc":
      return <UgcMode {...props} />;
    case "text_to_video":
      return <TextToVideoMode {...props} />;
    case "multi_reference":
      return <MultiReferenceMode {...props} />;
    case "lipsyncing":
      return <LipsyncMode {...props} />;
    case "multi_frame":
      return <MultiFrameMode {...props} />;
    case "first_n_last_frames":
      return <FirstAndLastFrameMode {...props} />;
    default: {
      const _exhaustive: never = state.mode;
      void _exhaustive;
      return null;
    }
  }
}
