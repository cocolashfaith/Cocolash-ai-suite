"use client";

/**
 * Video defaults + Seedance pricing (D4/D5) — ONE global settings row.
 *
 * Defaults are global, not per-user: the wizard still remembers the last
 * values in localStorage, but a fresh session starts from what an admin sets
 * here (engine, quality tier, duration, aspect ratio) and every cost estimate
 * in the app is priced with the credit tables + usd_per_credit below.
 *
 * Reads go through `useVideoSettings()` (falls back to defaults, so the card
 * always renders). Writes are PATCH /api/settings/video and are admin-only —
 * non-admins see the values read-only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useVideoSettings } from "@/lib/settings/use-video-settings";
import type { VideoSettings } from "@/lib/settings/video-settings";
import {
  QUALITY_TIERS,
  QUALITY_TIER_IDS,
  SEEDANCE_ENGINES,
  SEEDANCE_ENGINE_IDS,
} from "@/lib/seedance/engines";
import {
  SEEDANCE_25_RATES_DEFAULT,
  estimateCredits,
  formatCredits,
  formatUsd,
  type Seedance25RateTable,
} from "@/lib/seedance/pricing";
import {
  AUTO_DURATION,
  SEEDANCE_25_ASPECT_RATIOS,
  SEEDANCE_25_LIMITS,
  SEEDANCE_25_RESOLUTIONS,
  type Seedance25AspectRatio,
  type Seedance25Resolution,
} from "@/lib/seedance/v25/types";
import { SEEDANCE25_MIGRATION_FILE } from "@/lib/supabase/schema-errors";
import type { QualityTier, SeedanceEngine } from "@/lib/types";

// ── Rate table ⇄ editable strings ────────────────────────────

type RateKind = "standard" | "reduced";
const RATE_KINDS: RateKind[] = ["standard", "reduced"];
const RATE_KIND_LABELS: Record<RateKind, string> = {
  standard: "Standard rate — no video inputs",
  reduced: "Reduced rate — with video inputs (multi-reference / edit / extend / multi-frame)",
};

type RateCellStrings = { standard: string; uncensored: string };
type RateStrings = Record<RateKind, Record<Seedance25Resolution, RateCellStrings>>;

function ratesToStrings(rates: Seedance25RateTable): RateStrings {
  const out = {} as RateStrings;
  for (const kind of RATE_KINDS) {
    out[kind] = {} as Record<Seedance25Resolution, RateCellStrings>;
    for (const res of SEEDANCE_25_RESOLUTIONS) {
      out[kind][res] = {
        standard: String(rates[kind][res].standard),
        uncensored: String(rates[kind][res].uncensored),
      };
    }
  }
  return out;
}

/** null when any cell is not a positive number (Save stays disabled). */
function stringsToRates(strings: RateStrings): Seedance25RateTable | null {
  const out = {} as Seedance25RateTable;
  for (const kind of RATE_KINDS) {
    out[kind] = {} as Seedance25RateTable[RateKind];
    for (const res of SEEDANCE_25_RESOLUTIONS) {
      const standard = Number(strings[kind][res].standard);
      const uncensored = Number(strings[kind][res].uncensored);
      if (!Number.isFinite(standard) || standard <= 0) return null;
      if (!Number.isFinite(uncensored) || uncensored <= 0) return null;
      out[kind][res] = { standard, uncensored };
    }
  }
  return out;
}

// ── Component ────────────────────────────────────────────────

export interface VideoDefaultsFormProps {
  /** Only admins may PATCH; everyone else sees the values read-only. */
  isAdmin: boolean;
}

export function VideoDefaultsForm({ isAdmin }: VideoDefaultsFormProps) {
  const { settings, loading, missingTable, refresh } = useVideoSettings();

  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [engine, setEngine] = useState<SeedanceEngine>(settings.default_engine);
  const [tier, setTier] = useState<QualityTier>(settings.default_quality_tier);
  const [autoDuration, setAutoDuration] = useState(settings.default_duration === AUTO_DURATION);
  const [duration, setDuration] = useState<string>(
    settings.default_duration === AUTO_DURATION ? "8" : String(settings.default_duration)
  );
  const [aspect, setAspect] = useState<Seedance25AspectRatio>(settings.default_aspect_ratio);
  const [usdPerCredit, setUsdPerCredit] = useState<string>(String(settings.usd_per_credit));
  const [rateStrings, setRateStrings] = useState<RateStrings>(() => ratesToStrings(settings.rates));

  const syncFromSettings = useCallback((s: VideoSettings) => {
    setEngine(s.default_engine);
    setTier(s.default_quality_tier);
    setAutoDuration(s.default_duration === AUTO_DURATION);
    setDuration(s.default_duration === AUTO_DURATION ? "8" : String(s.default_duration));
    setAspect(s.default_aspect_ratio);
    setUsdPerCredit(String(s.usd_per_credit));
    setRateStrings(ratesToStrings(s.rates));
  }, []);

  // Re-seed the form whenever the fetched settings change (initial load + refresh).
  useEffect(() => {
    syncFromSettings(settings);
  }, [settings, syncFromSettings]);

  const readOnly = !isAdmin || missingTable;

  // ── Derived / validated values ────────────────────────────
  const parsedRates = useMemo(() => stringsToRates(rateStrings), [rateStrings]);
  const parsedUsdPerCredit = Number(usdPerCredit);
  const usdPerCreditValid =
    Number.isFinite(parsedUsdPerCredit) && parsedUsdPerCredit > 0 && parsedUsdPerCredit <= 1;

  const parsedDuration = autoDuration ? AUTO_DURATION : Number(duration);
  const durationValid =
    autoDuration ||
    (Number.isInteger(parsedDuration) &&
      parsedDuration >= SEEDANCE_25_LIMITS.durationMin &&
      parsedDuration <= SEEDANCE_25_LIMITS.durationMax);

  const formValid = !!parsedRates && usdPerCreditValid && durationValid;

  /** Only the keys the admin actually changed (the PATCH schema is strict + non-empty). */
  const patch = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (engine !== settings.default_engine) p.default_engine = engine;
    if (tier !== settings.default_quality_tier) p.default_quality_tier = tier;
    if (durationValid && parsedDuration !== settings.default_duration) {
      p.default_duration = parsedDuration;
    }
    if (aspect !== settings.default_aspect_ratio) p.default_aspect_ratio = aspect;
    if (usdPerCreditValid && parsedUsdPerCredit !== settings.usd_per_credit) {
      p.usd_per_credit = parsedUsdPerCredit;
    }
    if (parsedRates && JSON.stringify(parsedRates) !== JSON.stringify(settings.rates)) {
      // JSONB column — always send the whole table.
      p.rates = parsedRates;
    }
    return p;
  }, [
    engine,
    tier,
    aspect,
    parsedDuration,
    durationValid,
    parsedUsdPerCredit,
    usdPerCreditValid,
    parsedRates,
    settings,
  ]);

  const dirty = Object.keys(patch).length > 0;

  /** Live preview with the values currently in the form (not the saved ones). */
  const preview = useMemo(() => {
    const est = estimateCredits({
      engine: "2.5",
      mode: "ugc",
      resolution: "1080p",
      durationSeconds: 30,
      rates: parsedRates ?? settings.rates,
      usdPerCredit: usdPerCreditValid ? parsedUsdPerCredit : settings.usd_per_credit,
    });
    return `1080p × 30 s ≈ ${formatCredits(est.credits)} credits ≈ ${formatUsd(est.usd)}`;
  }, [parsedRates, parsedUsdPerCredit, usdPerCreditValid, settings]);

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!dirty || !formValid) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/video", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.error === "invalid_settings" && data?.issues
            ? String(data.issues)
            : data?.error === "migration_required"
            ? `Run ${SEEDANCE25_MIGRATION_FILE} first`
            : data?.message || data?.error || `Save failed (${res.status})`
        );
      }
      setSaved(true);
      toast.success("Video defaults saved");
      setTimeout(() => setSaved(false), 3000);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save video defaults");
    } finally {
      setSaving(false);
    }
  };

  const resetRates = () => setRateStrings(ratesToStrings(SEEDANCE_25_RATES_DEFAULT));

  const setRateCell = (
    kind: RateKind,
    res: Seedance25Resolution,
    column: keyof RateCellStrings,
    value: string
  ) => {
    setRateStrings((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [res]: { ...prev[kind][res], [column]: value } },
    }));
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-2xl border border-coco-beige-dark bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-coco-beige/30"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coco-golden/10">
          <Clapperboard className="h-4 w-4 text-coco-golden" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-coco-brown">Video Defaults &amp; Pricing</h3>
          <p className="text-xs text-coco-brown-medium">
            Engine, quality tier, duration, aspect ratio + Seedance 2.5 credit rates
          </p>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-coco-brown-medium/50" />
        ) : (
          <ChevronDown className="h-5 w-5 text-coco-brown-medium/50" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-coco-beige-dark px-5 pb-5 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
            </div>
          ) : (
            <>
              {missingTable && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-xs text-amber-700">
                    Run <code className="font-mono">{SEEDANCE25_MIGRATION_FILE}</code> — settings are
                    read-only until then.
                  </p>
                </div>
              )}

              {!isAdmin && !missingTable && (
                <p className="rounded-lg bg-coco-beige/40 px-3 py-2 text-xs text-coco-brown-medium">
                  Ask an admin to change these.
                </p>
              )}

              {/* Engine */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-coco-brown">Default engine</label>
                <Select
                  value={engine}
                  onValueChange={(v) => setEngine(v as SeedanceEngine)}
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEEDANCE_ENGINE_IDS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {SEEDANCE_ENGINES[id].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-coco-brown-medium/40">
                  {SEEDANCE_ENGINES[engine].description}
                </p>
              </div>

              {/* Quality tier */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-coco-brown">Default quality tier</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {QUALITY_TIER_IDS.map((id) => {
                    const spec = QUALITY_TIERS[id];
                    const active = tier === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={readOnly}
                        onClick={() => setTier(id)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          active
                            ? "border-coco-golden bg-coco-golden/10"
                            : "border-coco-beige-dark bg-white hover:bg-coco-beige/30"
                        )}
                      >
                        <span className="block text-xs font-semibold text-coco-brown">
                          {spec.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-coco-brown-medium/60">
                          {spec.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration + aspect */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-coco-brown">
                    Default duration (seconds)
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={SEEDANCE_25_LIMITS.durationMin}
                      max={SEEDANCE_25_LIMITS.durationMax}
                      step={1}
                      value={duration}
                      disabled={readOnly || autoDuration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="max-w-[7rem] text-sm"
                    />
                    <label className="flex items-center gap-2 text-xs text-coco-brown-medium">
                      <input
                        type="checkbox"
                        checked={autoDuration}
                        disabled={readOnly}
                        onChange={(e) => setAutoDuration(e.target.checked)}
                        className="h-3.5 w-3.5 accent-coco-golden"
                      />
                      Auto
                    </label>
                  </div>
                  <p className="text-[10px] text-coco-brown-medium/40">
                    {autoDuration
                      ? "Auto (-1) — Enhancor picks the length; estimates assume 10 s."
                      : `${SEEDANCE_25_LIMITS.durationMin}–${SEEDANCE_25_LIMITS.durationMax} s (Seedance 2.0 caps at 15 s).`}
                  </p>
                  {!durationValid && (
                    <p className="text-[10px] text-red-500">
                      Enter a whole number between {SEEDANCE_25_LIMITS.durationMin} and{" "}
                      {SEEDANCE_25_LIMITS.durationMax}, or tick Auto.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-coco-brown">
                    Default aspect ratio
                  </label>
                  <Select
                    value={aspect}
                    onValueChange={(v) => setAspect(v as Seedance25AspectRatio)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="w-full max-w-[10rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEEDANCE_25_ASPECT_RATIOS.map((ratio) => (
                        <SelectItem key={ratio} value={ratio}>
                          {ratio}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-coco-brown-medium/40">
                    9:16 for TikTok / Reels. Edit &amp; Extend always force adaptive.
                  </p>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-3 rounded-xl border border-coco-beige-dark bg-coco-beige/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-coco-brown">
                    Seedance 2.5 credit pricing
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={readOnly}
                    onClick={resetRates}
                    className="h-6 gap-1 px-2 text-[10px] text-coco-brown-medium hover:text-coco-brown"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset to Enhancor 2026-09 rates
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-coco-brown">USD per credit</label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.0001}
                    value={usdPerCredit}
                    disabled={readOnly}
                    onChange={(e) => setUsdPerCredit(e.target.value)}
                    className="max-w-[9rem] text-sm"
                  />
                  <p className="text-[10px] text-coco-brown-medium/40">
                    Enhancor top-up: $25 = 25,000 credits → 0.001.
                  </p>
                  {!usdPerCreditValid && (
                    <p className="text-[10px] text-red-500">Must be greater than 0 and ≤ 1.</p>
                  )}
                </div>

                {RATE_KINDS.map((kind) => (
                  <div key={kind} className="space-y-2">
                    <p className="text-[11px] font-semibold text-coco-brown">
                      {RATE_KIND_LABELS[kind]}
                    </p>
                    <div className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-coco-brown-medium/50" />
                      <span className="text-[10px] uppercase tracking-wide text-coco-brown-medium/50">
                        credits/s
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-coco-brown-medium/50">
                        uncensored
                      </span>
                      {SEEDANCE_25_RESOLUTIONS.map((res) => (
                        <RateRow
                          key={`${kind}-${res}`}
                          resolution={res}
                          cell={rateStrings[kind][res]}
                          disabled={readOnly}
                          onChange={(column, value) => setRateCell(kind, res, column, value)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {!parsedRates && (
                  <p className="text-[10px] text-red-500">
                    Every rate must be a number greater than 0.
                  </p>
                )}

                <p className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-coco-brown">
                  {preview}
                </p>
              </div>

              {/* Save */}
              {isAdmin && (
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    onClick={handleSave}
                    disabled={saving || readOnly || !dirty || !formValid}
                    className="gap-2 bg-coco-golden text-white hover:bg-coco-golden-dark"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : saved ? (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Video Defaults
                      </>
                    )}
                  </Button>
                  {dirty && !saving && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => syncFromSettings(settings)}
                      className="text-xs text-coco-brown-medium hover:text-coco-brown"
                    >
                      Discard changes
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RateRow({
  resolution,
  cell,
  disabled,
  onChange,
}: {
  resolution: Seedance25Resolution;
  cell: RateCellStrings;
  disabled: boolean;
  onChange: (column: keyof RateCellStrings, value: string) => void;
}) {
  return (
    <>
      <span className="text-[11px] font-medium text-coco-brown">{resolution}</span>
      <Input
        type="number"
        min={0}
        step={0.001}
        value={cell.standard}
        disabled={disabled}
        aria-label={`${resolution} credits per second`}
        onChange={(e) => onChange("standard", e.target.value)}
        className="h-8 text-xs"
      />
      <Input
        type="number"
        min={0}
        step={0.001}
        value={cell.uncensored}
        disabled={disabled}
        aria-label={`${resolution} uncensored credits per second`}
        onChange={(e) => onChange("uncensored", e.target.value)}
        className="h-8 text-xs"
      />
    </>
  );
}
