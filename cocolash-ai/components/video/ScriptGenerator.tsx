"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  ShoppingBag,
  MessageSquare,
  Tag,
  GraduationCap,
  Package,
  ArrowLeftRight,
  Pencil,
} from "lucide-react";
import { ScriptVariations } from "./ScriptVariations";
import type {
  CampaignType,
  ScriptTone,
  VideoDuration,
  ScriptResult,
} from "@/lib/types";

interface ScriptGeneratorProps {
  onScriptSelected: (script: ScriptResult, editedText?: string) => void;
}

const CAMPAIGN_TYPES: {
  value: CampaignType;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "product-showcase", label: "Product Showcase", description: "Highlight the product itself", icon: ShoppingBag },
  { value: "testimonial", label: "Testimonial", description: "Personal review & results", icon: MessageSquare },
  { value: "promo", label: "Sale / Promo", description: "Urgency-driven offer", icon: Tag },
  { value: "educational", label: "Educational", description: "Tips & tutorials", icon: GraduationCap },
  { value: "unboxing", label: "Unboxing", description: "First look & reveal", icon: Package },
  { value: "before-after", label: "Before & After", description: "Transformation content", icon: ArrowLeftRight },
];

const TONES: { value: ScriptTone; label: string; emoji: string }[] = [
  { value: "casual", label: "Casual", emoji: "💬" },
  { value: "energetic", label: "Energetic", emoji: "⚡" },
  { value: "calm", label: "Calm", emoji: "🧘" },
  { value: "professional", label: "Professional", emoji: "💎" },
];

const DURATIONS: { value: VideoDuration; label: string; platforms: string }[] = [
  { value: 15, label: "15s", platforms: "TikTok, Reels" },
  { value: 30, label: "30s", platforms: "Reels, Stories" },
  { value: 60, label: "60s", platforms: "TikTok, YouTube Shorts" },
];

export function ScriptGenerator({ onScriptSelected }: ScriptGeneratorProps) {
  const [campaignType, setCampaignType] = useState<CampaignType>("product-showcase");
  const [tone, setTone] = useState<ScriptTone>("casual");
  const [duration, setDuration] = useState<VideoDuration>(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scripts, setScripts] = useState<ScriptResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");

  const handleGenerate = async () => {
    setIsGenerating(true);
    setScripts([]);
    setSelectedIndex(null);
    setIsEditing(false);

    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignType, tone, duration }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Script generation failed");
        return;
      }

      setScripts(data.scripts);
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
    const finalText = isEditing ? editedText : undefined;
    onScriptSelected(script, finalText);
  };

  return (
    <div className="space-y-6">
      {/* Campaign Type */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Campaign Type
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CAMPAIGN_TYPES.map((ct) => {
            const Icon = ct.icon;
            const isActive = campaignType === ct.value;
            return (
              <button
                key={ct.value}
                type="button"
                onClick={() => setCampaignType(ct.value)}
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

      {/* Generate Scripts Button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full gap-2 bg-coco-brown py-5 text-sm font-semibold text-white shadow-md transition-all hover:bg-coco-brown-light hover:shadow-lg disabled:opacity-50"
        size="lg"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating scripts...
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

          <Button
            onClick={handleUseScript}
            className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl"
            size="lg"
          >
            Use This Script →
          </Button>
        </div>
      )}
    </div>
  );
}
