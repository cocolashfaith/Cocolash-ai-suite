"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SeedanceV4WizardState } from "../types";
import { CapabilityCard } from "../CapabilityCard";

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
 * Multi-Frame Step 2 — Text-Only Flow (Phase 26, D-26-01, D-26-02, D-26-03)
 *
 * Multi-Frame mode generates a multi-shot sequence from text descriptions only.
 * The Enhancor API silently drops images[] / products[] / influencers[] for
 * multi_frame mode. This component collects:
 *   - campaignType (locked at Step 1)
 *   - script (locked at Step 1)
 *   - subjectBrief (free-text description, new in v4.1)
 *
 * Step 3 Director receives all three and outputs multi_frame_prompts[] where
 * each segment's prompt textually describes subject + product (no @image/@product
 * references — the API has no images to anchor to).
 */
export function MultiFrameMode(props: MultiFrameModeProps) {
  const { state, setState, onReady } = props;
  const [validationError, setValidationError] = useState<string | null>(null);

  const subjectBriefTrimmed = state.subjectBrief?.trim() ?? "";
  const isValid = subjectBriefTrimmed.length >= 10;

  const handleContinue = () => {
    setValidationError(null);
    if (!isValid) {
      setValidationError("Subject brief must be at least 10 characters.");
      return;
    }
    onReady();
  };

  return (
    <div className="space-y-4">
      <CapabilityCard mode="multi_frame" />

      {/* D-26-03: Inline banner — verbatim copy */}
      <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
        <p className="text-xs leading-relaxed text-blue-900">
          <strong>Multi-Frame builds a multi-shot sequence from text only.</strong> No avatar or product images are attached — the Director describes your subject inside each shot. For image-anchored continuity, use UGC or Multi-Reference.
        </p>
      </div>

      {/* Subject Brief textarea */}
      <div className="space-y-2">
        <label htmlFor="subject-brief" className="block text-xs font-semibold text-coco-brown">
          Subject Brief
        </label>
        <textarea
          id="subject-brief"
          value={state.subjectBrief ?? ""}
          onChange={(e) => {
            setState({ subjectBrief: e.target.value });
            setValidationError(null);
          }}
          placeholder="Describe the subject and product so the Director can carry continuity across every shot. e.g. 'a woman in her late 20s, brand of black lash strips in her hand'"
          rows={4}
          className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-xs text-coco-brown outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
        />
        <p className="text-[10px] text-coco-brown-medium">
          {subjectBriefTrimmed.length} characters
          {!isValid && subjectBriefTrimmed.length > 0 && (
            <span className="ml-2 text-orange-600">
              (need {10 - subjectBriefTrimmed.length} more)
            </span>
          )}
        </p>
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600 mt-0.5" />
          <p className="text-xs text-red-800">{validationError}</p>
        </div>
      )}

      {/* Continue button */}
      <Button
        onClick={handleContinue}
        disabled={!isValid}
        className="w-full bg-coco-golden py-5 text-sm font-semibold text-white hover:bg-coco-golden-dark disabled:opacity-50"
      >
        Continue to Review
      </Button>

      {/* CapabilityCard slot — wired by Plan 26-03 */}
    </div>
  );
}
