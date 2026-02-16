"use client";

import { useState, useMemo } from "react";
import {
  Heart,
  Flower2,
  Ghost,
  TreePine,
  PartyPopper,
  Sparkles,
  Users,
  Bath,
  Globe,
  Gem,
  GraduationCap,
  BookOpen,
  Sun,
  Wine,
  Leaf,
  CalendarDays,
  ChevronDown,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SeasonalSelection, SeasonalPresetCategory } from "@/lib/types";
import {
  SEASONAL_PRESETS,
  SEASONAL_CATEGORY_LABELS,
} from "@/lib/prompts/modules/seasonal";
import type { SeasonalPresetDefinition } from "@/lib/types";

// ── Props ─────────────────────────────────────────────────────
interface SeasonalSelectorProps {
  value: SeasonalSelection;
  onChange: (value: SeasonalSelection) => void;
}

// ── Icon map for each preset slug ─────────────────────────────
const PRESET_ICONS: Record<string, React.ElementType> = {
  "valentines-day": Heart,
  "mothers-day": Flower2,
  "halloween": Ghost,
  "christmas": TreePine,
  "new-years-eve": PartyPopper,
  "national-lash-day": Sparkles,
  "galentines-day": Users,
  "self-care-sunday": Bath,
  "world-lash-day": Globe,
  "wedding-season": Gem,
  "prom-season": GraduationCap,
  "back-to-school": BookOpen,
  "summer-vibes": Sun,
  "holiday-party": Wine,
  "fall-autumn": Leaf,
};

// ── Category order ────────────────────────────────────────────
const CATEGORY_ORDER: SeasonalPresetCategory[] = [
  "major_holiday",
  "beauty_industry",
  "seasonal",
];

// ── Component ─────────────────────────────────────────────────
export function SeasonalSelector({ value, onChange }: SeasonalSelectorProps) {
  const [showAllSeasons, setShowAllSeasons] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const currentMonth = new Date().getMonth() + 1;

  // Get filtered presets based on current month toggle
  const filteredPresets = useMemo(() => {
    if (showAllSeasons) return SEASONAL_PRESETS;
    return SEASONAL_PRESETS.filter((p) =>
      p.availableMonths.includes(currentMonth)
    );
  }, [showAllSeasons, currentMonth]);

  // Group by category
  const groupedPresets = useMemo(() => {
    const grouped: Partial<Record<SeasonalPresetCategory, SeasonalPresetDefinition[]>> = {};
    for (const preset of filteredPresets) {
      if (!grouped[preset.category]) {
        grouped[preset.category] = [];
      }
      grouped[preset.category]!.push(preset);
    }
    return grouped;
  }, [filteredPresets]);

  // Selected preset
  const selectedPreset = useMemo(() => {
    if (!value.presetSlug) return null;
    return SEASONAL_PRESETS.find((p) => p.slug === value.presetSlug) || null;
  }, [value.presetSlug]);

  // Handle preset selection
  const handleSelectPreset = (slug: string | null) => {
    if (slug === null) {
      onChange({ presetSlug: null, selectedProps: [] });
    } else {
      // When selecting a new preset, auto-select the first 3 props
      const preset = SEASONAL_PRESETS.find((p) => p.slug === slug);
      const defaultProps = preset ? preset.props.slice(0, 3) : [];
      onChange({ presetSlug: slug, selectedProps: defaultProps });
    }
    setIsDropdownOpen(false);
  };

  // Handle prop toggle
  const handleToggleProp = (prop: string) => {
    const newProps = value.selectedProps.includes(prop)
      ? value.selectedProps.filter((p) => p !== prop)
      : [...value.selectedProps, prop];
    onChange({ ...value, selectedProps: newProps });
  };

  const currentMonthPresetCount = SEASONAL_PRESETS.filter((p) =>
    p.availableMonths.includes(currentMonth)
  ).length;

  return (
    <div className="space-y-3">
      {/* Header with label and "All Seasons" toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-coco-brown">
          <CalendarDays className="mr-1.5 inline-block h-4 w-4 text-coco-golden" />
          Seasonal / Holiday Preset
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-coco-brown-medium/60">
            All Seasons
          </span>
          <Switch
            checked={showAllSeasons}
            onCheckedChange={setShowAllSeasons}
            className="data-[state=checked]:bg-coco-golden"
          />
        </div>
      </div>

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={cn(
            "flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all",
            selectedPreset
              ? "border-coco-golden bg-coco-golden/5"
              : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
          )}
        >
          <div className="flex items-center gap-3">
            {selectedPreset ? (
              <>
                {(() => {
                  const Icon = PRESET_ICONS[selectedPreset.slug] || CalendarDays;
                  return (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coco-golden/15">
                      <Icon className="h-4 w-4 text-coco-golden" />
                    </div>
                  );
                })()}
                <div>
                  <p className="text-sm font-medium text-coco-brown">
                    {selectedPreset.name}
                  </p>
                  <p className="text-[11px] text-coco-brown-medium/60">
                    {SEASONAL_CATEGORY_LABELS[selectedPreset.category as SeasonalPresetCategory]}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coco-beige">
                  <CalendarDays className="h-4 w-4 text-coco-brown-medium/50" />
                </div>
                <div>
                  <p className="text-sm text-coco-brown-medium/70">
                    No Season
                  </p>
                  <p className="text-[11px] text-coco-brown-medium/40">
                    {showAllSeasons
                      ? `${SEASONAL_PRESETS.length} presets available`
                      : `${currentMonthPresetCount} in season now`}
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedPreset && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPreset(null);
                }}
                className="rounded-full p-1 text-coco-brown-medium/40 transition-colors hover:bg-coco-beige hover:text-coco-brown"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-coco-brown-medium/40 transition-transform",
                isDropdownOpen && "rotate-180"
              )}
            />
          </div>
        </button>

        {/* Dropdown panel */}
        {isDropdownOpen && (
          <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border-2 border-coco-beige-dark bg-white shadow-lg">
            {/* "No Season" option */}
            <button
              type="button"
              onClick={() => handleSelectPreset(null)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-coco-beige px-4 py-3 text-left transition-colors hover:bg-coco-beige/30",
                !value.presetSlug && "bg-coco-golden/5"
              )}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-coco-beige">
                <X className="h-3.5 w-3.5 text-coco-brown-medium/50" />
              </div>
              <span className="text-sm text-coco-brown-medium">No Season</span>
            </button>

            {/* Grouped presets */}
            {CATEGORY_ORDER.map((catKey) => {
              const presets = groupedPresets[catKey];
              if (!presets || presets.length === 0) return null;

              return (
                <div key={catKey}>
                  {/* Category header */}
                  <div className="border-b border-coco-beige bg-coco-beige/20 px-4 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-coco-brown-medium/50">
                      {SEASONAL_CATEGORY_LABELS[catKey]}
                    </p>
                  </div>

                  {/* Preset options */}
                  {presets.map((preset) => {
                    const Icon = PRESET_ICONS[preset.slug] || CalendarDays;
                    const isSelected = value.presetSlug === preset.slug;

                    return (
                      <button
                        key={preset.slug}
                        type="button"
                        onClick={() => handleSelectPreset(preset.slug)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-coco-golden/5",
                          isSelected && "bg-coco-golden/10"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg",
                            isSelected
                              ? "bg-coco-golden/20"
                              : "bg-coco-beige"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5",
                              isSelected
                                ? "text-coco-golden"
                                : "text-coco-brown-medium/60"
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm",
                              isSelected
                                ? "font-medium text-coco-brown"
                                : "text-coco-brown-medium"
                            )}
                          >
                            {preset.name}
                          </p>
                          <p className="truncate text-[10px] text-coco-brown-medium/40">
                            {preset.moodKeywords.slice(0, 3).join(" · ")}
                          </p>
                        </div>
                        {/* Month indicator */}
                        <span className="text-[10px] text-coco-brown-medium/30">
                          {formatMonthRange(preset.availableMonths)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected preset's props as toggleable chips */}
      {selectedPreset && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-coco-brown-medium/60">
            Suggested props (toggle to include):
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedPreset.props.map((prop) => {
              const isSelected = value.selectedProps.includes(prop);
              return (
                <Badge
                  key={prop}
                  variant="outline"
                  className={cn(
                    "cursor-pointer select-none border-2 px-3 py-1 text-xs transition-all",
                    isSelected
                      ? "border-coco-golden bg-coco-golden/10 text-coco-brown hover:bg-coco-golden/20"
                      : "border-coco-beige-dark bg-white text-coco-brown-medium/60 hover:border-coco-golden/40 hover:bg-coco-golden/5"
                  )}
                  onClick={() => handleToggleProp(prop)}
                >
                  {isSelected && (
                    <span className="mr-1 text-coco-golden">✓</span>
                  )}
                  {prop}
                </Badge>
              );
            })}
          </div>
          {/* Color hint */}
          {selectedPreset.colorOverrides && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-coco-brown-medium/40">
                Color accent:
              </span>
              <div
                className="h-4 w-4 rounded-full border border-coco-beige-dark"
                style={{ backgroundColor: selectedPreset.colorOverrides.accent }}
              />
              <div
                className="h-4 w-4 rounded-full border border-coco-beige-dark"
                style={{ backgroundColor: selectedPreset.colorOverrides.background }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

const MONTH_ABBR = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonthRange(months: number[]): string {
  if (months.length === 12) return "Year-round";
  if (months.length === 1) return MONTH_ABBR[months[0]];

  const sorted = [...months].sort((a, b) => a - b);
  return `${MONTH_ABBR[sorted[0]]}–${MONTH_ABBR[sorted[sorted.length - 1]]}`;
}
