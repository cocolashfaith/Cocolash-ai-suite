"use client";

import { Button } from "@/components/ui/button";
import type { SeedanceV4WizardState } from "../types";

interface TextToVideoModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

export function TextToVideoMode({ state, setState, onReady }: TextToVideoModeProps) {
  const description = state.t2vSceneDescription ?? "";

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-coco-brown">
            Describe the scene
          </h3>
          <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
            What should the video show? Be concrete — subject, action, environment, lighting.
            The Seedance Director will rewrite this into an optimized prompt for you to review.
          </p>
        </div>
        <textarea
          value={description}
          onChange={(e) => setState({ t2vSceneDescription: e.target.value })}
          rows={6}
          placeholder="A close-up of a CocoLash Volume Dahlia lash strip on a clean marble vanity, soft window light catching the wispy fibers, the brand box visible just out of focus."
          className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-4 text-sm text-coco-brown placeholder:text-coco-brown-medium/40 outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
        />
        <p className="text-[10px] text-coco-brown-medium/50">
          {description.trim().split(/\s+/).filter(Boolean).length} words. The
          Director will use this + your campaign type to write the final
          Seedance prompt.
        </p>
      </section>

      <Button
        onClick={onReady}
        disabled={description.trim().length < 10}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}
