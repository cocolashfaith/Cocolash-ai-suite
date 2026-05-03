"use client";

import { useCallback, useState } from "react";
import { Step1ScriptAndMode } from "./Step1ScriptAndMode";
import { Step2DynamicInputs } from "./Step2DynamicInputs";
import { Step3PromptReviewAndGenerate } from "./Step3PromptReviewAndGenerate";
import { DEFAULT_V4_STATE, type SeedanceV4WizardState } from "./types";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Script + Mode" },
  { label: "Inputs" },
  { label: "Prompt Review" },
];

interface SeedanceV4WizardProps {
  initialPersonImageUrl?: string;
}

/**
 * Top-level v4.0 mode-first Seedance wizard.
 * Replaces the legacy Seedance flow (Script → Avatar+Product → Generate).
 * Mode is now picked at Step 1 and drives Step 2's inputs.
 *
 * Wizard state is preserved across step navigation (back/next) — components
 * remain mounted, hidden via CSS, so partial inputs aren't lost.
 */
export function SeedanceV4Wizard({ initialPersonImageUrl: _ }: SeedanceV4WizardProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [maxStep, setMaxStep] = useState<0 | 1 | 2>(0);
  const [state, setStateRaw] = useState<SeedanceV4WizardState>(DEFAULT_V4_STATE);

  const setState = useCallback(
    (
      update:
        | Partial<SeedanceV4WizardState>
        | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
    ) => {
      setStateRaw((prev) => {
        const patch = typeof update === "function" ? update(prev) : update;
        return { ...prev, ...patch };
      });
    },
    []
  );

  const advanceTo = (n: 0 | 1 | 2) => {
    setStep(n);
    setMaxStep((prev) => (n > prev ? n : prev));
  };

  const handleReset = () => {
    setStateRaw(DEFAULT_V4_STATE);
    setStep(0);
    setMaxStep(0);
  };

  return (
    <div>
      {/* Stepper */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const isCompleted = i < step;
            const isActive = i === step;
            const isReachable = i <= maxStep;
            return (
              <div key={s.label} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => isReachable && setStep(i as 0 | 1 | 2)}
                  disabled={!isReachable}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                      isCompleted
                        ? "border-coco-golden bg-coco-golden text-white"
                        : isActive
                        ? "border-coco-golden bg-coco-golden/10 text-coco-golden"
                        : "border-coco-beige-dark bg-white text-coco-brown-medium/40"
                    )}
                  >
                    {i + 1}
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isActive
                        ? "text-coco-golden"
                        : isCompleted
                        ? "text-coco-brown"
                        : "text-coco-brown-medium/40"
                    )}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className="mx-2 mt-[-18px] h-[2px] flex-1">
                    <div
                      className={cn(
                        "h-full rounded-full transition-colors",
                        i < step ? "bg-coco-golden" : "bg-coco-beige-dark"
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Steps — kept mounted so navigation preserves state */}
      <div className="mx-auto max-w-2xl">
        <div className={step === 0 ? "" : "hidden"}>
          <Step1ScriptAndMode
            state={state}
            setState={setState}
            onAdvance={() => advanceTo(1)}
          />
        </div>
        {maxStep >= 1 && (
          <div className={step === 1 ? "" : "hidden"}>
            <Step2DynamicInputs
              state={state}
              setState={setState}
              onAdvance={() => advanceTo(2)}
            />
          </div>
        )}
        {maxStep >= 2 && (
          <div className={step === 2 ? "" : "hidden"}>
            <Step3PromptReviewAndGenerate
              state={state}
              setState={setState}
              onReset={handleReset}
            />
          </div>
        )}
      </div>
    </div>
  );
}
