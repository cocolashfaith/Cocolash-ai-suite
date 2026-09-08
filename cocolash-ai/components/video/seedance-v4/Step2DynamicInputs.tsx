"use client";

import type { SeedanceV4WizardState } from "./types";
import { UgcMode } from "./modes/UgcMode";
import { TextToVideoMode } from "./modes/TextToVideoMode";
import { MultiReferenceMode } from "./modes/MultiReferenceMode";
import { LipsyncMode } from "./modes/LipsyncMode";
import { VoiceCloneMode } from "./modes/VoiceCloneMode";
import { MultiFrameMode } from "./modes/MultiFrameMode";
import { FirstAndLastFrameMode } from "./modes/FirstAndLastFrameMode";
import { EditExtendMode } from "./modes/EditExtendMode";

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
 * Step 2 dispatches to the right mode-specific input panel based on Step 1's
 * `mode` choice. Each panel collects exactly the media its mode accepts (see
 * the "Modes × media fields" table in docs/seedance-2.5/01-API-REFERENCE.md),
 * writes it into the shared wizard state and calls onAdvance() when ready.
 *
 * All nine Seedance 2.5 modes are reachable (D2); engine 2.0 only ever selects
 * six of them, so edit / extend / voice_clone simply never render there.
 */
export function Step2DynamicInputs({ state, setState, onAdvance }: Step2Props) {
  const props = { state, setState, onReady: onAdvance };

  switch (state.mode) {
    case "ugc":
      return <UgcMode {...props} />;
    case "text_to_video":
      return <TextToVideoMode {...props} />;
    case "multi_reference":
      return <MultiReferenceMode {...props} />;
    case "first_n_last_frames":
      return <FirstAndLastFrameMode {...props} />;
    case "multi_frame":
      return <MultiFrameMode {...props} />;
    case "edit":
    case "extend":
      return <EditExtendMode {...props} />;
    case "lipsyncing":
      return <LipsyncMode {...props} />;
    case "voice_clone":
      return <VoiceCloneMode {...props} />;
    default:
      return (
        <div className="rounded-xl border-2 border-dashed border-coco-beige-dark bg-coco-beige-light/40 p-6 text-center text-sm text-coco-brown-medium">
          The <strong>{state.mode}</strong> inputs panel is not available yet.
        </div>
      );
  }
}
