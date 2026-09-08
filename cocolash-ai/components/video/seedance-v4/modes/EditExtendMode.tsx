"use client";

import { useState } from "react";
import { AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityCard } from "../CapabilityCard";
import { ImageMultiPicker } from "../pickers/ImageMultiPicker";
import { MediaListPicker } from "../pickers/MediaListPicker";
import { inputLimitsFor } from "../lib/mode-input-rules";
import type { SeedanceV4WizardState } from "../types";

interface EditExtendModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

const MIN_INSTRUCTION_CHARS = 10;

const COPY = {
  edit: {
    heading: "Source video",
    videoHelp:
      "The clip to change. Up to 10 videos, combined length under 30 s. Seedance keeps everything you don't ask it to change.",
    instructionLabel: "What should change?",
    instructionPlaceholder:
      "e.g. Replace the plain background with a sunlit bathroom counter, keep the creator and the product exactly as they are.",
    durationNote: "Duration: Auto — Edit always keeps the source length (the API requires it).",
  },
  extend: {
    heading: "Source video",
    videoHelp:
      "The clip to continue past its last frame. Up to 10 videos, combined length under 30 s.",
    instructionLabel: "How should it continue?",
    instructionPlaceholder:
      "e.g. She turns the box to the camera, opens it and lifts out the lash tray, still smiling.",
    durationNote:
      "Duration: your Step-1 setting decides how much new footage is generated (Auto lets Seedance choose).",
  },
} as const;

/**
 * Step 2 for the two 2.5 video-in modes (D2).
 *
 *   edit   — change something inside an existing clip (duration locked to Auto)
 *   extend — continue a clip past its last frame
 *
 * Both REQUIRE at least one source video and take an instruction that the
 * Director turns into the Seedance prompt. Images and audio are optional
 * extra references. Output aspect always follows the source video.
 */
export function EditExtendMode({ state, setState, onReady }: EditExtendModeProps) {
  const mode: "edit" | "extend" = state.mode === "extend" ? "extend" : "edit";
  const copy = COPY[mode];
  const limits = inputLimitsFor(state.engine, mode);
  const [touched, setTouched] = useState(false);

  const instruction = state.editInstruction ?? "";
  const hasVideo = (state.inputVideoUrls?.length ?? 0) > 0;
  const instructionOk = instruction.trim().length >= MIN_INSTRUCTION_CHARS;
  const canContinue = hasVideo && instructionOk;

  function handleContinue() {
    setTouched(true);
    if (!canContinue) return;
    onReady();
  }

  return (
    <div className="space-y-6">
      <CapabilityCard mode={mode} />

      <MediaListPicker
        kind="video"
        required
        title={copy.heading}
        help={copy.videoHelp}
        max={limits.videos}
        urls={state.inputVideoUrls ?? []}
        onChange={(urls) => setState({ inputVideoUrls: urls })}
      />

      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-coco-brown">
            {copy.instructionLabel} <span className="text-coco-golden">*</span>
          </h3>
          <p className="text-[11px] text-coco-brown-medium/60">
            The Director rewrites this into the Seedance prompt.
          </p>
        </div>
        <textarea
          value={instruction}
          onChange={(e) => setState({ editInstruction: e.target.value })}
          rows={4}
          placeholder={copy.instructionPlaceholder}
          className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-xs text-coco-brown outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
        />
        <p className="text-[10px] text-coco-brown-medium/50">
          {instruction.trim().length} characters
          {!instructionOk && instruction.trim().length > 0 && (
            <span className="ml-2 text-orange-600">
              (need {MIN_INSTRUCTION_CHARS - instruction.trim().length} more)
            </span>
          )}
        </p>
      </section>

      <ImageMultiPicker
        title="Reference images (optional)"
        help="Extra visual references — a product, a face, a style board."
        max={limits.images}
        sources={["upload", "library", "gallery", "url"]}
        urls={state.inputImageUrls ?? []}
        onChange={(urls) => setState({ inputImageUrls: urls })}
      />

      <MediaListPicker
        kind="audio"
        title="Reference audio (optional)"
        help="Combined length under 30 s."
        max={limits.audios}
        urls={state.inputAudioUrls ?? []}
        onChange={(urls) => setState({ inputAudioUrls: urls })}
      />

      <div className="flex items-start gap-2 rounded-lg border border-coco-beige-dark bg-coco-beige-light/40 px-3 py-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coco-brown-medium/50" />
        <p className="text-[11px] text-coco-brown-medium/70">
          {copy.durationNote} Output follows the source aspect ratio, and the file defaults to
          <strong> .mov</strong> (change it under Step 1 → Advanced).
        </p>
      </div>

      {touched && !canContinue && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-xs text-red-800">
            {!hasVideo
              ? `Add at least one source video for ${mode} mode.`
              : `Describe what should change in at least ${MIN_INSTRUCTION_CHARS} characters.`}
          </p>
        </div>
      )}

      <Button
        onClick={handleContinue}
        disabled={!canContinue}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}
