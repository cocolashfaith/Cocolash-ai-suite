"use client";

import { ArrowRight } from "lucide-react";
import { SeedanceScriptStep } from "../seedance/SeedanceScriptStep";
import { Button } from "@/components/ui/button";
import { ProductReferencePicker } from "./ProductReferencePicker";
import { EngineModeSelector } from "./EngineModeSelector";
import { OutputSettingsPanel } from "./OutputSettingsPanel";
import { effectiveScriptDuration, needsScript } from "./lib/mode-input-rules";
import type { SeedanceV4WizardState } from "./types";
import type { CampaignType, ScriptTone } from "@/lib/types";

interface Step1Props {
  state: SeedanceV4WizardState;
  setState: (
    update: Partial<SeedanceV4WizardState> | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onAdvance: () => void;
}

/**
 * Step 1 — engine, mode, output settings, (UGC) products, script.
 *
 * Order matters: engine + mode decide which controls and which inputs make
 * sense, so they come first (D1/D2). Products stay the spine of the UGC flow —
 * picked before the script so the copy is grounded in the real product.
 *
 * Modes where a script is optional (text-to-video, lip-sync, voice clone,
 * edit, extend) get a "Skip" button straight to Step 2.
 */
export function Step1ScriptAndMode({ state, setState, onAdvance }: Step1Props) {
  const isUgc = state.mode === "ugc";
  const scriptRequired = needsScript(state.mode);
  const hasProducts = (state.ugcProductImageUrls?.length ?? 0) >= 1;
  // Only UGC grounds its script in product images; other modes can write one
  // straight away.
  const scriptGated = isUgc && !hasProducts;

  return (
    <div className="space-y-8">
      {/* ── Engine + mode (D1, D2) ────────────────────────── */}
      <EngineModeSelector state={state} setState={setState} />

      {/* ── Output: tier, duration, aspect, advanced (D3, D9, D10) ── */}
      <OutputSettingsPanel state={state} setState={setState} />

      {/* ── Product images — the spine of the UGC flow ─────── */}
      {isUgc && <ProductReferencePicker state={state} setState={setState} />}

      {/* ── Script ────────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-sm font-semibold text-coco-brown">
            Script{" "}
            {!scriptRequired && (
              <span className="font-normal text-coco-brown-medium/60">(optional)</span>
            )}
          </label>
          <p className="text-[11px] text-coco-brown-medium/60">
            {scriptRequired
              ? "What the creator says in the video."
              : "Add one if the clip should carry dialogue — otherwise skip."}
          </p>
        </div>

        {scriptGated ? (
          <div className="rounded-xl border-2 border-dashed border-coco-beige-dark bg-coco-beige-light/40 p-6 text-center">
            <p className="text-sm font-medium text-coco-brown">
              Select a product image first
            </p>
            <p className="mt-1 text-[11px] text-coco-brown-medium/60">
              Pick at least one product above — the script is written from what the product
              actually looks like.
            </p>
          </div>
        ) : (
          <SeedanceScriptStep
            duration={effectiveScriptDuration(state)}
            productImageUrls={state.ugcProductImageUrls ?? []}
            productSku={state.productSku || undefined}
            productFacts={state.productFacts}
            onProductFacts={(facts) => setState({ productFacts: facts })}
            onScriptSelected={(script, meta, editedText) => {
              setState({
                script,
                scriptText: (editedText ?? script.full_script).trim(),
                scriptId: meta.scriptId,
                campaignType: meta.campaignType as CampaignType,
                tone: meta.tone as ScriptTone,
                // duration is owned by the Output panel above — not clobbered here.
              });
              // Auto-advance — single-button advance UX.
              onAdvance();
            }}
          />
        )}

        {!scriptRequired && (
          <Button
            type="button"
            variant="outline"
            onClick={onAdvance}
            className="w-full gap-2 text-xs font-semibold"
          >
            Skip — continue to inputs
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </section>
    </div>
  );
}
