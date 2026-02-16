"use client";

import { useState } from "react";
import {
  Users,
  Shuffle,
  Settings2,
  Laugh,
  Footprints,
  Camera,
  UtensilsCrossed,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  GroupDiversitySelections,
  GroupPersonConfig,
  GroupAction,
  AgeRange,
  SkinTone,
  HairStyle,
} from "@/lib/types";
import { SKIN_TONE_OPTIONS } from "@/lib/prompts/modules/skin-tones";
import { HAIR_STYLE_OPTIONS } from "@/lib/prompts/modules/hair-styles";
import {
  GROUP_ACTION_OPTIONS,
  AGE_RANGE_OPTIONS,
} from "@/lib/prompts/modules/compositions";

// ── Props ─────────────────────────────────────────────────────
interface DiversityControlsProps {
  value: GroupDiversitySelections;
  onChange: (value: GroupDiversitySelections) => void;
}

// ── Icon map for group actions ────────────────────────────────
const ACTION_ICONS: Record<GroupAction, React.ElementType> = {
  laughing: Laugh,
  walking: Footprints,
  posing: Camera,
  brunch: UtensilsCrossed,
  "getting-ready": Sparkles,
};

// ── Default person config ─────────────────────────────────────
const DEFAULT_PERSON: GroupPersonConfig = {
  skinTone: "random",
  hairStyle: "random",
};

// ── Component ─────────────────────────────────────────────────
export function DiversityControls({ value, onChange }: DiversityControlsProps) {
  const [expandedPerson, setExpandedPerson] = useState<number | null>(null);

  // Helper to update a field
  const update = <K extends keyof GroupDiversitySelections>(
    key: K,
    val: GroupDiversitySelections[K]
  ) => {
    onChange({ ...value, [key]: val });
  };

  // Handle count change — adjust people array
  const handleCountChange = (count: 3 | 4 | 5) => {
    const newPeople = [...value.people];
    while (newPeople.length < count) {
      newPeople.push({ ...DEFAULT_PERSON });
    }
    onChange({
      ...value,
      groupCount: count,
      people: newPeople.slice(0, count),
    });
  };

  // Handle per-person config change
  const handlePersonChange = (
    index: number,
    field: keyof GroupPersonConfig,
    val: SkinTone | HairStyle
  ) => {
    const newPeople = [...value.people];
    newPeople[index] = { ...newPeople[index], [field]: val };
    onChange({ ...value, people: newPeople });
  };

  return (
    <div className="space-y-4 rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-coco-golden" />
        <span className="text-sm font-semibold text-coco-brown">
          Group Diversity Controls
        </span>
      </div>

      {/* ── Person Count ────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-coco-brown-medium/70">
          Number of People
        </label>
        <div className="grid grid-cols-3 gap-2">
          {([3, 4, 5] as const).map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => handleCountChange(count)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border-2 py-2 text-sm font-medium transition-all",
                value.groupCount === count
                  ? "border-coco-golden bg-coco-golden/15 text-coco-brown"
                  : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              {count}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mode: Diverse Mix vs Custom ──────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-coco-brown-medium/70">
          Diversity Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update("mode", "diverse-mix")}
            className={cn(
              "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left transition-all",
              value.mode === "diverse-mix"
                ? "border-coco-golden bg-coco-golden/15"
                : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
            )}
          >
            <Shuffle
              className={cn(
                "h-4 w-4 shrink-0",
                value.mode === "diverse-mix"
                  ? "text-coco-golden"
                  : "text-coco-brown-medium/50"
              )}
            />
            <div>
              <p
                className={cn(
                  "text-xs font-medium",
                  value.mode === "diverse-mix"
                    ? "text-coco-brown"
                    : "text-coco-brown-medium"
                )}
              >
                Diverse Mix
              </p>
              <p className="text-[10px] text-coco-brown-medium/50">
                Auto-assign diversity
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => update("mode", "custom")}
            className={cn(
              "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left transition-all",
              value.mode === "custom"
                ? "border-coco-golden bg-coco-golden/15"
                : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
            )}
          >
            <Settings2
              className={cn(
                "h-4 w-4 shrink-0",
                value.mode === "custom"
                  ? "text-coco-golden"
                  : "text-coco-brown-medium/50"
              )}
            />
            <div>
              <p
                className={cn(
                  "text-xs font-medium",
                  value.mode === "custom"
                    ? "text-coco-brown"
                    : "text-coco-brown-medium"
                )}
              >
                Custom
              </p>
              <p className="text-[10px] text-coco-brown-medium/50">
                Choose per person
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Per-Person Config (Custom mode only) ──────────────── */}
      {value.mode === "custom" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-coco-brown-medium/70">
            Per-Person Configuration
          </label>
          <div className="space-y-1.5">
            {Array.from({ length: value.groupCount }).map((_, i) => {
              const person = value.people[i] || DEFAULT_PERSON;
              const isExpanded = expandedPerson === i;

              // Find display labels
              const skinLabel =
                SKIN_TONE_OPTIONS.find((o) => o.value === person.skinTone)
                  ?.label || "Random";
              const hairLabel =
                HAIR_STYLE_OPTIONS.find((o) => o.value === person.hairStyle)
                  ?.label || "Random";

              return (
                <div key={i}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPerson(isExpanded ? null : i)
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-all",
                      isExpanded
                        ? "border-coco-golden/40 bg-white"
                        : "border-coco-beige-dark bg-white/50 hover:bg-white"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden/20 text-[10px] font-bold text-coco-golden">
                        {i + 1}
                      </div>
                      <span className="text-xs text-coco-brown-medium">
                        Person {i + 1}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge
                        variant="outline"
                        className="border-coco-beige-dark text-[10px] text-coco-brown-medium/60"
                      >
                        {skinLabel}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-coco-beige-dark text-[10px] text-coco-brown-medium/60"
                      >
                        {hairLabel}
                      </Badge>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-1 rounded-lg border border-coco-beige bg-white p-3 space-y-3">
                      {/* Skin Tone */}
                      <div>
                        <p className="mb-1.5 text-[10px] font-medium text-coco-brown-medium/60">
                          Skin Tone
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {SKIN_TONE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                handlePersonChange(i, "skinTone", opt.value)
                              }
                              className={cn(
                                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] transition-all",
                                person.skinTone === opt.value
                                  ? "border-coco-golden bg-coco-golden/10 text-coco-brown font-medium"
                                  : "border-coco-beige-dark text-coco-brown-medium/60 hover:border-coco-golden/40"
                              )}
                            >
                              <div
                                className="h-3 w-3 rounded-full border border-black/10"
                                style={{
                                  background: opt.swatchColor,
                                }}
                              />
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Hair Style */}
                      <div>
                        <p className="mb-1.5 text-[10px] font-medium text-coco-brown-medium/60">
                          Hair Style
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {HAIR_STYLE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                handlePersonChange(i, "hairStyle", opt.value)
                              }
                              className={cn(
                                "rounded-md border px-2 py-1 text-[10px] transition-all",
                                person.hairStyle === opt.value
                                  ? "border-coco-golden bg-coco-golden/10 text-coco-brown font-medium"
                                  : "border-coco-beige-dark text-coco-brown-medium/60 hover:border-coco-golden/40"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Age Range ────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-coco-brown-medium/70">
          Age Range
        </label>
        <div className="grid grid-cols-3 gap-2">
          {AGE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update("ageRange", opt.value)}
              className={cn(
                "rounded-lg border-2 py-2 text-xs font-medium transition-all",
                value.ageRange === opt.value
                  ? "border-coco-golden bg-coco-golden/15 text-coco-brown"
                  : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Group Action ─────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-coco-brown-medium/70">
          Group Action / Pose
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GROUP_ACTION_OPTIONS.map((opt) => {
            const Icon = ACTION_ICONS[opt.value];
            const isActive = value.groupAction === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("groupAction", opt.value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all",
                  isActive
                    ? "border-coco-golden bg-coco-golden/15 text-coco-brown"
                    : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "text-coco-golden" : "text-coco-brown-medium/50"
                  )}
                />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
