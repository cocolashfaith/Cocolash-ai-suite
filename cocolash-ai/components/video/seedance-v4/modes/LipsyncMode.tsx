"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityCard } from "../CapabilityCard";
import { ImageMultiPicker } from "../pickers/ImageMultiPicker";
import { MediaListPicker } from "../pickers/MediaListPicker";
import { inputLimitsFor } from "../lib/mode-input-rules";
import type { SeedanceV4WizardState } from "../types";

export interface LipsyncBaseModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

interface SpeakerAudioModeProps extends LipsyncBaseModeProps {
  mode: "lipsyncing" | "voice_clone";
}

const COPY = {
  lipsyncing: {
    imagesTitle: "Speaker images",
    imagesHelp:
      "Photos of the person who will speak — mouth visible, front-facing works best. The first one is the primary reference.",
    audioTitle: "Voice track",
    audioHelp: "The audio the speaker lip-syncs to. One file, ≤ 30 s.",
    note: "The finished clip runs as long as your audio — Seedance drives the mouth from the track.",
  },
  voice_clone: {
    imagesTitle: "Speaker images",
    imagesHelp:
      "Photos of the person who should speak. The first one is the primary reference.",
    audioTitle: "Voice to clone",
    audioHelp:
      "A clean recording of the voice to reproduce. One file, ≤ 30 s — no music or background chatter.",
    note: "Seedance clones the voice from this recording and speaks your prompt with it.",
  },
} as const;

/**
 * Shared Step 2 for the two speaker+audio modes (D2, D13).
 *
 * Both take `images[]` (≥1, ≤30) plus a single `lipsyncing_audio` URL. Voice
 * generation (ElevenLabs) is explicitly out of scope for this pass — the audio
 * is uploaded, picked or pasted.
 *
 * `lipsyncImageUrl` is kept in sync with `inputImageUrls[0]` because Step 3's
 * vision path still keys on the single-image field.
 */
export function LipsyncBaseMode({ mode, state, setState, onReady }: SpeakerAudioModeProps) {
  const copy = COPY[mode];
  const limits = inputLimitsFor(state.engine, mode);
  const images = state.inputImageUrls ?? [];
  const audioUrls = state.lipsyncAudioUrl ? [state.lipsyncAudioUrl] : [];
  const canContinue = images.length > 0 && !!state.lipsyncAudioUrl;

  return (
    <div className="space-y-6">
      <CapabilityCard mode={mode} />

      <ImageMultiPicker
        required
        title={copy.imagesTitle}
        help={copy.imagesHelp}
        max={limits.images}
        sources={["upload", "gallery", "url"]}
        urls={images}
        onChange={(urls) => setState({ inputImageUrls: urls, lipsyncImageUrl: urls[0] })}
      />

      <MediaListPicker
        kind="audio"
        required
        title={copy.audioTitle}
        help={copy.audioHelp}
        max={1}
        urls={audioUrls}
        onChange={(urls) => setState({ lipsyncAudioUrl: urls[0] })}
      />

      <div className="flex items-start gap-2 rounded-lg border border-coco-beige-dark bg-coco-beige-light/40 px-3 py-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coco-brown-medium/50" />
        <p className="text-[11px] text-coco-brown-medium/70">{copy.note}</p>
      </div>

      <Button
        onClick={onReady}
        disabled={!canContinue}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}

/** Lip-sync: speaker images + the voice track their mouth follows. */
export function LipsyncMode(props: LipsyncBaseModeProps) {
  return <LipsyncBaseMode mode="lipsyncing" {...props} />;
}
