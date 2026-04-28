"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  BookOpen,
  HelpCircle,
  Gem,
  Pencil,
  ShieldAlert,
  ChevronDown,
  RefreshCw,
  Library,
  FileEdit,
  Save,
  Check,
} from "lucide-react";
import { ScriptVariations } from "./ScriptVariations";
import { ScriptLibraryPicker } from "./ScriptLibraryPicker";
import type {
  CampaignType,
  ScriptTone,
  VideoDuration,
  ScriptResult,
  VideoScript,
} from "@/lib/types";
import { HEYGEN_SCRIPT_CAMPAIGN_TYPES } from "@/lib/video/heygen-campaign";

type ScriptMode = "generate" | "library" | "manual";

interface ScriptGeneratorProps {
  onScriptSelected: (
    script: ScriptResult,
    meta: {
      campaignType: CampaignType;
      tone: ScriptTone;
      duration: VideoDuration;
      scriptId?: string;
    },
    editedText?: string
  ) => void;
}

const ALL_CAMPAIGN_ROWS: {
  value: CampaignType;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "brand-story", label: "Brand Story", description: "Mission, values & identity", icon: BookOpen },
  { value: "faq", label: "FAQ", description: "Answer common questions", icon: HelpCircle },
  { value: "myths", label: "Myth-Busting", description: "Bust lash misconceptions", icon: ShieldAlert },
  { value: "product-knowledge", label: "Product Knowledge", description: "Deep-dive into product details", icon: Gem },
];

const CAMPAIGN_TYPES = ALL_CAMPAIGN_ROWS.filter((c) =>
  (HEYGEN_SCRIPT_CAMPAIGN_TYPES as CampaignType[]).includes(c.value)
);

const CAMPAIGN_FOCUS_CONFIG: Record<string, { label: string; placeholder: string }> = {
  "brand-story": {
    label: "Which story should we tell?",
    placeholder: "e.g. why you founded the brand, a customer moment, the turning point...",
  },
  faq: {
    label: "Which question do you want to answer?",
    placeholder: "e.g. Do false lashes damage your real lashes? How long do they last?",
  },
  myths: {
    label: "Which myth should we bust?",
    placeholder: "e.g. false lashes are uncomfortable, you need to be a pro to apply them...",
  },
  "product-knowledge": {
    label: "Which product or feature should we focus on?",
    placeholder: "e.g. the cotton band technology, a specific lash style, the reusability...",
  },
};

const CAMPAIGN_DEFAULTS: Record<string, { tone: ScriptTone; duration: VideoDuration }> = {
  "brand-story": { tone: "calm", duration: 60 },
  faq: { tone: "professional", duration: 30 },
  myths: { tone: "energetic", duration: 30 },
  "product-knowledge": { tone: "professional", duration: 60 },
};

const TONES: { value: ScriptTone; label: string; emoji: string }[] = [
  { value: "casual", label: "Casual", emoji: "💬" },
  { value: "energetic", label: "Energetic", emoji: "⚡" },
  { value: "calm", label: "Calm", emoji: "🧘" },
  { value: "professional", label: "Professional", emoji: "💎" },
];

const DURATIONS: { value: VideoDuration; label: string; platforms: string }[] = [
  { value: 30, label: "30s", platforms: "Reels, Stories" },
  { value: 60, label: "60s", platforms: "TikTok, YouTube Shorts" },
  { value: 90, label: "90s", platforms: "YouTube, Website" },
];

const MODE_TABS: { value: ScriptMode; label: string; icon: React.ElementType }[] = [
  { value: "generate", label: "Generate with AI", icon: Sparkles },
  { value: "library", label: "Saved Scripts", icon: Library },
  { value: "manual", label: "Write My Own", icon: FileEdit },
];

export function ScriptGenerator({ onScriptSelected }: ScriptGeneratorProps) {
  const [mode, setMode] = useState<ScriptMode>("generate");
  const [campaignType, setCampaignType] = useState<CampaignType>("brand-story");
  const [tone, setTone] = useState<ScriptTone>("calm");
  const [duration, setDuration] = useState<VideoDuration>(60);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scripts, setScripts] = useState<ScriptResult[]>([]);
  const [scriptIds, setScriptIds] = useState<string[]>([]);
  const [savedScriptTexts, setSavedScriptTexts] = useState<Record<number, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [campaignFocus, setCampaignFocus] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Manual mode state
  const [manualText, setManualText] = useState("");
  const [manualSavedId, setManualSavedId] = useState<string | null>(null);
  const [manualSavedText, setManualSavedText] = useState("");
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Library mode state
  const [libraryScript, setLibraryScript] = useState<VideoScript | null>(null);
  const [libraryEditedText, setLibraryEditedText] = useState("");
  const [libraryIsEditing, setLibraryIsEditing] = useState(false);

  const handleCampaignChange = (value: CampaignType) => {
    setCampaignType(value);
    const defaults = CAMPAIGN_DEFAULTS[value];
    if (defaults) {
      setTone(defaults.tone);
      setDuration(defaults.duration);
    }
    setCampaignFocus("");
  };

  const focusConfig = CAMPAIGN_FOCUS_CONFIG[campaignType];

  const handleGenerate = async () => {
    setIsGenerating(true);
    setSelectedIndex(null);
    setIsEditing(false);

    try {
      const excludeHooks = scripts.length > 0
        ? scripts.map((s) => s.hook)
        : undefined;

      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline: "heygen",
          campaignType,
          tone,
          duration,
          ...(campaignFocus.trim() ? { campaignFocus: campaignFocus.trim() } : {}),
          ...(customInstructions.trim() ? { customInstructions: customInstructions.trim() } : {}),
          ...(excludeHooks ? { excludeHooks } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Script generation failed");
        return;
      }

      setScripts(data.scripts);
      setScriptIds(data.savedIds ?? []);
      setSavedScriptTexts({});
      toast.success("3 script variations generated!");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    setEditedText(scripts[index].full_script);
    setIsEditing(false);
  };

  const handleUseScript = () => {
    if (selectedIndex === null) return;
    const script = scripts[selectedIndex];
    const currentText = (isEditing ? editedText : script.full_script).trim();
    const scriptId =
      scriptIds[selectedIndex] && savedScriptTexts[selectedIndex] === currentText
        ? scriptIds[selectedIndex]
        : undefined;
    const finalText =
      (scriptId || currentText === script.full_script.trim()) ? undefined : currentText;
    onScriptSelected(
      script,
      { campaignType, tone, duration, scriptId },
      finalText
    );
  };

  const handleSaveSelectedScript = async () => {
    if (selectedIndex === null) return;
    const script = scripts[selectedIndex];
    const currentText = (isEditing ? editedText : script.full_script).trim();
    if (!currentText) {
      toast.error("Please add script text before saving.");
      return;
    }

    setSavingIndex(selectedIndex);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          pipeline: "heygen",
          campaignType,
          tone,
          duration,
          scriptText: currentText,
          hookText: script.hook,
          ctaText: script.cta,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save script");
        return;
      }

      setScriptIds((prev) => {
        const next = [...prev];
        next[selectedIndex] = data.savedId;
        return next;
      });
      setSavedScriptTexts((prev) => ({ ...prev, [selectedIndex]: currentText }));
      toast.success("Script saved to agent library");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setSavingIndex(null);
    }
  };

  const handleLibrarySelect = (vs: VideoScript) => {
    setLibraryScript(vs);
    setLibraryEditedText(vs.script_text);
    setLibraryIsEditing(false);
  };

  const handleUseLibraryScript = () => {
    if (!libraryScript) return;
    const script: ScriptResult = {
      hook: libraryScript.hook_text ?? libraryScript.script_text.slice(0, 120),
      body: libraryScript.script_text,
      cta: libraryScript.cta_text ?? "",
      full_script: libraryScript.script_text,
      estimated_duration: libraryScript.duration_seconds,
      style_match: 1,
    };
    const wasEdited = libraryIsEditing && libraryEditedText !== libraryScript.script_text;
    const finalText = wasEdited ? libraryEditedText : undefined;
    const scriptId = wasEdited ? undefined : libraryScript.id;
    onScriptSelected(
      script,
      {
        campaignType: libraryScript.campaign_type,
        tone: libraryScript.tone,
        duration: libraryScript.duration_seconds as VideoDuration,
        scriptId,
      },
      finalText
    );
  };

  const handleUseManualScript = () => {
    const trimmed = manualText.trim();
    if (!trimmed) {
      toast.error("Please write or paste a script first.");
      return;
    }
    const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    const hook = sentences[0]?.trim() ?? trimmed.slice(0, 120);
    const cta = sentences.length > 1 ? (sentences[sentences.length - 1]?.trim() ?? "") : "";
    const body = sentences.length > 2
      ? sentences.slice(1, -1).join(". ").trim()
      : trimmed;

    const script: ScriptResult = {
      hook,
      body,
      cta,
      full_script: trimmed,
      estimated_duration: duration,
      style_match: 1,
    };
    const scriptId = manualSavedId && manualSavedText === trimmed ? manualSavedId : undefined;
    onScriptSelected(script, { campaignType, tone, duration, scriptId }, scriptId ? undefined : trimmed);
  };

  const handleSaveManualScript = async () => {
    const trimmed = manualText.trim();
    if (!trimmed) {
      toast.error("Please write or paste a script first.");
      return;
    }

    const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    setIsSavingManual(true);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          pipeline: "heygen",
          campaignType,
          tone,
          duration,
          scriptText: trimmed,
          hookText: sentences[0]?.trim() ?? trimmed.slice(0, 120),
          ctaText: sentences.length > 1 ? sentences[sentences.length - 1]?.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save script");
        return;
      }

      setManualSavedId(data.savedId);
      setManualSavedText(trimmed);
      toast.success("Script saved to agent library");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setIsSavingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Tabs */}
      <div className="flex gap-1 rounded-xl border-2 border-coco-beige-dark bg-coco-beige-light/50 p-1">
        {MODE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = mode === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setMode(tab.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition-all",
                isActive
                  ? "bg-white text-coco-brown shadow-sm"
                  : "text-coco-brown-medium/60 hover:text-coco-brown-medium"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Generate with AI Mode ────────────────────── */}
      {mode === "generate" && (
        <>
          {/* Campaign Type */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">
              Content Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {CAMPAIGN_TYPES.map((ct) => {
                const Icon = ct.icon;
                const isActive = campaignType === ct.value;
                return (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => handleCampaignChange(ct.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all duration-200",
                      isActive
                        ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                        : "border-coco-beige-dark bg-white hover:border-coco-golden/40 hover:bg-coco-golden/5"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                        isActive
                          ? "bg-coco-golden text-white"
                          : "bg-coco-beige text-coco-brown-medium"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="text-center">
                      <p className={cn("text-xs font-medium", isActive ? "text-coco-brown" : "text-coco-brown-medium")}>
                        {ct.label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-coco-brown-medium/60">{ct.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">Tone</label>
            <div className="grid grid-cols-4 gap-3">
              {TONES.map((t) => {
                const isActive = tone === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTone(t.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 transition-all duration-200",
                      isActive
                        ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                        : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                    )}
                  >
                    <span className="text-lg">{t.emoji}</span>
                    <span className={cn("text-xs font-medium", isActive ? "text-coco-brown" : "text-coco-brown-medium")}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">Duration</label>
            <div className="grid grid-cols-3 gap-3">
              {DURATIONS.map((d) => {
                const isActive = duration === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      "rounded-xl border-2 py-3 text-center transition-all duration-200",
                      isActive
                        ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                        : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                    )}
                  >
                    <p className={cn("text-lg font-bold", isActive ? "text-coco-golden" : "text-coco-brown-medium")}>
                      {d.label}
                    </p>
                    <p className="text-[10px] text-coco-brown-medium/60">{d.platforms}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campaign Focus */}
          {focusConfig && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-coco-brown">
                {focusConfig.label}
              </label>
              <textarea
                value={campaignFocus}
                onChange={(e) => setCampaignFocus(e.target.value)}
                placeholder={focusConfig.placeholder}
                rows={2}
                className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-sm text-coco-brown placeholder:text-coco-brown-medium/40 outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
              />
            </div>
          )}

          {/* Advanced: Custom Instructions */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-medium text-coco-brown-medium hover:text-coco-brown"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")}
              />
              Additional instructions
            </button>
            {showAdvanced && (
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Anything else the AI should keep in mind when writing the script..."
                rows={2}
                className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-sm text-coco-brown placeholder:text-coco-brown-medium/40 outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
              />
            )}
          </div>

          {/* Generate Scripts Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={cn(
              "w-full gap-2 py-5 text-sm font-semibold shadow-md transition-all hover:shadow-lg disabled:opacity-50",
              scripts.length > 0
                ? "border-2 border-coco-brown bg-white text-coco-brown hover:bg-coco-beige-light"
                : "bg-coco-brown text-white hover:bg-coco-brown-light"
            )}
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating scripts...
              </>
            ) : scripts.length > 0 ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate Scripts
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate 3 Script Variations
              </>
            )}
          </Button>

          {/* Script Results */}
          <ScriptVariations
            scripts={scripts}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
          />

          {/* Script Editor (inline edit of selected script) */}
          {selectedIndex !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-coco-brown">
                  Selected Script
                </label>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="flex items-center gap-1 text-xs font-medium text-coco-golden hover:text-coco-golden-dark"
                >
                  <Pencil className="h-3 w-3" />
                  {isEditing ? "Preview" : "Edit"}
                </button>
              </div>

              {isEditing ? (
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-sm text-coco-brown outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
                />
              ) : (
                <div className="rounded-xl border-2 border-coco-beige-dark bg-white/60 p-4">
                  <p className="whitespace-pre-wrap text-sm text-coco-brown-medium">
                    {editedText || scripts[selectedIndex].full_script}
                  </p>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  onClick={handleSaveSelectedScript}
                  disabled={savingIndex === selectedIndex}
                  variant="outline"
                  className="gap-2 border-coco-golden/40 bg-white py-5 text-sm font-semibold text-coco-brown hover:bg-coco-golden/10"
                  size="lg"
                >
                  {savingIndex === selectedIndex ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : scriptIds[selectedIndex] &&
                    savedScriptTexts[selectedIndex] ===
                      (isEditing ? editedText.trim() : scripts[selectedIndex].full_script.trim()) ? (
                    <>
                      <Check className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Script
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleUseScript}
                  className="gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl"
                  size="lg"
                >
                  Use This Script →
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Saved Scripts Mode ────────────────────────── */}
      {mode === "library" && (
        <>
          <ScriptLibraryPicker
            campaignType={campaignType}
            pipeline="heygen"
            onSelect={handleLibrarySelect}
          />

          {libraryScript && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-coco-brown">
                  Selected Script
                </label>
                <button
                  type="button"
                  onClick={() => setLibraryIsEditing(!libraryIsEditing)}
                  className="flex items-center gap-1 text-xs font-medium text-coco-golden hover:text-coco-golden-dark"
                >
                  <Pencil className="h-3 w-3" />
                  {libraryIsEditing ? "Preview" : "Edit"}
                </button>
              </div>

              {libraryIsEditing ? (
                <textarea
                  value={libraryEditedText}
                  onChange={(e) => setLibraryEditedText(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-sm text-coco-brown outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
                />
              ) : (
                <div className="rounded-xl border-2 border-coco-beige-dark bg-white/60 p-4">
                  <p className="whitespace-pre-wrap text-sm text-coco-brown-medium">
                    {libraryEditedText}
                  </p>
                </div>
              )}

              <Button
                onClick={handleUseLibraryScript}
                className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl"
                size="lg"
              >
                Use This Script →
              </Button>
            </div>
          )}
        </>
      )}

      {/* ─── Write My Own Mode ─────────────────────────── */}
      {mode === "manual" && (
        <>
          {/* Duration selector for manual mode */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">Duration</label>
            <div className="grid grid-cols-3 gap-3">
              {DURATIONS.map((d) => {
                const isActive = duration === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      "rounded-xl border-2 py-3 text-center transition-all duration-200",
                      isActive
                        ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                        : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                    )}
                  >
                    <p className={cn("text-lg font-bold", isActive ? "text-coco-golden" : "text-coco-brown-medium")}>
                      {d.label}
                    </p>
                    <p className="text-[10px] text-coco-brown-medium/60">{d.platforms}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">
              Your Script
            </label>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Write or paste your video script here..."
              rows={8}
              className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-4 text-sm text-coco-brown placeholder:text-coco-brown-medium/40 outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
            />
            <p className="text-[10px] text-coco-brown-medium/50">
              {manualText.trim().split(/\s+/).filter(Boolean).length} words
              {duration === 30 && " (aim for ~65-70 words)"}
              {duration === 60 && " (aim for ~130-140 words)"}
              {duration === 90 && " (aim for ~195-210 words)"}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={handleSaveManualScript}
              disabled={!manualText.trim() || isSavingManual}
              variant="outline"
              className="gap-2 border-coco-golden/40 bg-white py-5 text-sm font-semibold text-coco-brown hover:bg-coco-golden/10 disabled:opacity-50"
              size="lg"
            >
              {isSavingManual ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : manualSavedId && manualSavedText === manualText.trim() ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Script
                </>
              )}
            </Button>
            <Button
              onClick={handleUseManualScript}
              disabled={!manualText.trim()}
              className="gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
              size="lg"
            >
              Use This Script →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
