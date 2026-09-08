"use client";

import { toast } from "sonner";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEEDANCE_ENGINES,
  SEEDANCE_ENGINE_IDS,
  type SeedanceEngine,
} from "@/lib/seedance/engines";
import { SEEDANCE_25_MODE_LABELS, type Seedance25Mode } from "@/lib/seedance/v25/types";
import { MODE_CAPABILITIES } from "./lib/mode-capabilities";
import {
  availableModes,
  coerceStateForEngine,
  coerceStateForMode,
} from "./lib/mode-input-rules";
import type { SeedanceV4Mode, SeedanceV4WizardState } from "./types";

interface EngineModeSelectorProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
}

/** Human sentence for the toast after an engine switch ("Mode → UGC, …"). */
function describeEngineChanges(patch: Partial<SeedanceV4WizardState>): string[] {
  const changes: string[] = [];
  if (patch.mode) changes.push(`mode → ${SEEDANCE_25_MODE_LABELS[patch.mode as Seedance25Mode]}`);
  if (patch.aspectRatio) changes.push(`aspect → ${patch.aspectRatio}`);
  if (patch.duration !== undefined) changes.push(`duration → ${patch.duration}s`);
  if (patch.durationMode === "fixed") changes.push("Auto duration off");
  return changes;
}

/**
 * Step-1 engine + mode picker (D1, D2).
 *
 * Engine is a two-option segmented control — Seedance 2.5 (default) and 2.0
 * (legacy). The mode grid then shows exactly the modes the chosen engine
 * supports, so 2.0 simply never offers edit / extend / voice clone.
 *
 * Both switches route through the pure coercions in lib/mode-input-rules so
 * the wizard can never sit in a state the API would reject (2.0 + 30 s,
 * edit + fixed duration, ugc + adaptive aspect, …).
 */
export function EngineModeSelector({ state, setState }: EngineModeSelectorProps) {
  const modes = availableModes(state.engine);

  function selectEngine(engine: SeedanceEngine) {
    if (engine === state.engine) return;
    const patch = coerceStateForEngine(state, engine);
    setState(patch);
    const changes = describeEngineChanges(patch);
    if (changes.length > 0) {
      toast.info(`${SEEDANCE_ENGINES[engine].label}: ${changes.join(", ")}.`);
    } else {
      toast.success(`Switched to ${SEEDANCE_ENGINES[engine].label}.`);
    }
  }

  function selectMode(mode: SeedanceV4Mode) {
    if (mode === state.mode) return;
    setState(coerceStateForMode(state, mode));
  }

  return (
    <section className="space-y-4 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
      {/* ── Engine ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-sm font-semibold text-coco-brown">Engine</label>
          <p className="text-[11px] text-coco-brown-medium/60">
            {SEEDANCE_ENGINES[state.engine].description}
          </p>
        </div>
        <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
          {SEEDANCE_ENGINE_IDS.map((id) => {
            const spec = SEEDANCE_ENGINES[id];
            const active = state.engine === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectEngine(id)}
                aria-pressed={active}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-medium transition-all",
                  active
                    ? "bg-white text-coco-brown shadow-sm"
                    : "text-coco-brown-medium/50 hover:text-coco-brown-medium"
                )}
              >
                {spec.label}
                <span className="text-[10px] font-normal text-coco-brown-medium/50">
                  {id === "2.5" ? "(default)" : "(legacy)"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Mode ───────────────────────────────────────────── */}
      <div className="space-y-2 border-t border-coco-beige-dark/30 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-sm font-semibold text-coco-brown">Mode</label>
          <p className="text-[11px] text-coco-brown-medium/60">
            {modes.length} available on {SEEDANCE_ENGINES[state.engine].label}.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {modes.map((mode) => {
            const active = state.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => selectMode(mode)}
                aria-pressed={active}
                className={cn(
                  "relative rounded-lg border-2 p-3 text-left transition-all",
                  active
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                <p
                  className={cn(
                    "text-xs font-bold",
                    active ? "text-coco-golden" : "text-coco-brown"
                  )}
                >
                  {SEEDANCE_25_MODE_LABELS[mode as Seedance25Mode]}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-coco-brown-medium/60">
                  {MODE_CAPABILITIES[mode].bestFor}
                </p>
                {active && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-coco-golden">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
