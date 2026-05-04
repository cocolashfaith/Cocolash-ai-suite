"use client";

import { useMemo } from "react";
import {
  Sparkles,
  ShoppingBag,
  MessageSquare,
  Tag,
  GraduationCap,
  Package,
  ArrowLeftRight,
  Mic2,
  Layers,
  Film,
  Wand2,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SeedanceScriptStep } from "../seedance/SeedanceScriptStep";
import type { SeedanceV4Mode, SeedanceV4WizardState } from "./types";
import type {
  CampaignType,
  ScriptResult,
  ScriptTone,
  VideoDuration,
} from "@/lib/types";

/**
 * Six API modes with friendly labels + when-to-use copy.
 * Order = recommended-for-beginners first.
 */
const MODES: {
  value: SeedanceV4Mode;
  label: string;
  icon: React.ElementType;
  whenToUse: string;
  hint: string;
  badge?: string;
}[] = [
  {
    value: "ugc",
    label: "UGC Avatar",
    icon: Sparkles,
    whenToUse: "One creator holding your product. The fastest path.",
    hint: "creator-style single shot, anchored by avatar + product image",
    badge: "Recommended",
  },
  {
    value: "text_to_video",
    label: "Text-to-Video",
    icon: Type,
    whenToUse: "Describe a scene in words — no images required.",
    hint: "no media — fully prompt-driven",
  },
  {
    value: "multi_reference",
    label: "Multi-Reference",
    icon: Layers,
    whenToUse: "Multiple reference images, each with a specific job.",
    hint: "1–9 reference images, each with a defined role",
  },
  {
    value: "lipsyncing",
    label: "Lip-Sync",
    icon: Mic2,
    whenToUse: "Image of a speaker + audio file. Mouth follows audio.",
    hint: "avatar speaks your audio file",
  },
  {
    value: "multi_frame",
    label: "Multi-Frame Sequence",
    icon: Film,
    whenToUse: "UGC video with multiple shots / angles per scene.",
    hint: "text-driven multi-shot — no image input",
  },
  {
    value: "first_n_last_frames",
    label: "First + Last Frame",
    icon: Wand2,
    whenToUse: "Smooth transition between two scenes (AI-generated end).",
    hint: "start image → AI-generated end image, smooth transition",
  },
];

interface Step1Props {
  state: SeedanceV4WizardState;
  setState: (
    update: Partial<SeedanceV4WizardState> | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onAdvance: () => void;
}

export function Step1ScriptAndMode({ state, setState, onAdvance }: Step1Props) {
  const canAdvance = useMemo(() => {
    if (state.mode === "text_to_video") {
      // T2V doesn't need a spoken script — Step 2 collects the scene description
      return true;
    }
    return !!state.script || state.scriptText.trim().length > 0;
  }, [state.mode, state.script, state.scriptText]);

  return (
    <div className="space-y-8">
      {/* ── Mode picker — moved to Step 1 per v4.0 ──────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-sm font-semibold text-coco-brown">
            Generation Mode
          </label>
          <p className="text-[11px] text-coco-brown-medium/60">
            Determines what inputs Step 2 will ask you for.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = state.mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setState({ mode: m.value })}
                className={cn(
                  "relative flex h-full min-h-[120px] flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all",
                  active
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                {m.badge && (
                  <span className="absolute right-2 top-2 rounded-full bg-coco-golden/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-coco-golden">
                    {m.badge}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-coco-golden text-white" : "bg-coco-beige text-coco-brown-medium"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <p
                    className={cn(
                      "flex-1 text-xs font-semibold",
                      active ? "text-coco-brown" : "text-coco-brown-medium"
                    )}
                  >
                    {m.label}
                  </p>
                </div>
                <p className="text-[10px] leading-snug text-coco-brown-medium/60">
                  {m.whenToUse}
                </p>
                <p className="text-[11px] italic text-coco-brown-medium/60">
                  {m.hint}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Script — only for modes whose Director needs a spoken script.
          Lip-Sync uses uploaded audio; Text-to-Video describes scene in Step 2. */}
      {needsScript(state.mode) && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <label className="text-sm font-semibold text-coco-brown">
              Script
            </label>
            <p className="text-[11px] text-coco-brown-medium/60">
              What the creator says in the video.
            </p>
          </div>
          <SeedanceScriptStep
            onScriptSelected={(script, meta, editedText) => {
              setState({
                script,
                scriptText: (editedText ?? script.full_script).trim(),
                scriptId: meta.scriptId,
                campaignType: meta.campaignType as CampaignType,
                tone: meta.tone as ScriptTone,
                duration: meta.duration as VideoDuration,
              });
              // Auto-advance — single-button advance UX.
              onAdvance();
            }}
          />
        </section>
      )}

      {state.mode === "text_to_video" && (
        <section className="rounded-xl border-2 border-dashed border-coco-beige-dark bg-coco-beige-light/30 p-4">
          <p className="text-xs text-coco-brown-medium">
            Text-to-Video doesn&apos;t take reference images. The AI doesn&apos;t
            know what your specific product looks like, so don&apos;t reference
            it by name. Describe the scene generally in Step 2 (mood, action,
            lighting, environment).
          </p>
        </section>
      )}

      {state.mode === "lipsyncing" && (
        <section className="rounded-xl border-2 border-dashed border-coco-beige-dark bg-coco-beige-light/30 p-4">
          <p className="text-xs text-coco-brown-medium">
            Lip-Sync uses your uploaded audio — no script needed here. You&apos;ll
            upload a speaker image and an audio file in Step 2.
          </p>
        </section>
      )}

      {/* Single advance button — only for modes whose script step is HIDDEN
          (text_to_video, lipsyncing). Script-using modes auto-advance from
          inside SeedanceScriptStep above. */}
      {!needsScript(state.mode) && (
        <Button
          onClick={onAdvance}
          disabled={!canAdvance}
          className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
          size="lg"
        >
          Continue to {state.mode === "text_to_video" ? "Scene Description" : "Inputs"} →
        </Button>
      )}
    </div>
  );
}

function needsScript(mode: SeedanceV4Mode): boolean {
  return (
    mode === "ugc" ||
    mode === "multi_reference" ||
    mode === "multi_frame" ||
    mode === "first_n_last_frames"
  );
}
