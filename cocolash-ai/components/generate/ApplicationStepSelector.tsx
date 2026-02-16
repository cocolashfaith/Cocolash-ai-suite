"use client";

import { cn } from "@/lib/utils";
import type { ApplicationStep } from "@/lib/types";
import {
  ShieldCheck,
  Crosshair,
  Pipette,
  Search,
  Sparkles,
} from "lucide-react";

interface ApplicationStepSelectorProps {
  value: ApplicationStep;
  onChange: (value: ApplicationStep) => void;
}

const STEPS: {
  value: ApplicationStep;
  stepNumber: number;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    value: "preparation",
    stepNumber: 1,
    label: "Preparation",
    description: "Gel pads, tool prep",
    icon: ShieldCheck,
  },
  {
    value: "isolation",
    stepNumber: 2,
    label: "Isolation",
    description: "Single lash isolation",
    icon: Crosshair,
  },
  {
    value: "application",
    stepNumber: 3,
    label: "Application",
    description: "Bonding moment",
    icon: Pipette,
  },
  {
    value: "final-check",
    stepNumber: 4,
    label: "Final Check",
    description: "Mirror reveal",
    icon: Search,
  },
  {
    value: "reveal",
    stepNumber: 5,
    label: "Reveal",
    description: "Client reaction",
    icon: Sparkles,
  },
];

export function ApplicationStepSelector({
  value,
  onChange,
}: ApplicationStepSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Application Step
      </label>
      <p className="text-xs text-coco-brown-medium/70">
        Select which step of the lash application process to generate
      </p>
      <div className="space-y-2">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isActive = value === step.value;
          return (
            <button
              key={step.value}
              type="button"
              onClick={() => onChange(step.value)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border-2 p-3 transition-all duration-200",
                isActive
                  ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                  : "border-coco-beige-dark bg-white hover:border-coco-golden/40 hover:bg-coco-golden/5"
              )}
            >
              {/* Step number badge */}
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  isActive
                    ? "bg-coco-golden text-white"
                    : "bg-coco-beige text-coco-brown-medium"
                )}
              >
                {step.stepNumber}
              </div>

              {/* Icon */}
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "text-coco-golden"
                    : "text-coco-brown-medium/60"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>

              {/* Text */}
              <div className="text-left">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isActive ? "text-coco-brown" : "text-coco-brown-medium"
                  )}
                >
                  {step.label}
                </p>
                <p className="text-[11px] text-coco-brown-medium/60">
                  {step.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
