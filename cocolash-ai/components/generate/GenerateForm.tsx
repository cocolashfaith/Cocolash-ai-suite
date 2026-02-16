"use client";

import { useState, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { CategorySelector } from "./CategorySelector";
import { ProductSubCategorySelector } from "./ProductSubCategorySelector";
import { SkinToneSelector } from "./SkinToneSelector";
import { LashStyleSelector } from "./LashStyleSelector";
import { HairStyleSelector } from "./HairStyleSelector";
import { SceneSelector } from "./SceneSelector";
import { VibeSelector } from "./VibeSelector";
import { CompositionSelector } from "./CompositionSelector";
import { AspectRatioSelector } from "./AspectRatioSelector";
import { LogoOverlayToggle } from "./LogoOverlayToggle";
import { ContextNoteInput } from "./ContextNoteInput";
import { SeasonalSelector } from "./SeasonalSelector";
import { GenerationProgress } from "./GenerationProgress";
import { ImagePreview } from "./ImagePreview";
import { ErrorDisplay } from "./ErrorDisplay";

import type {
  GenerationSelections,
  ContentCategory,
  ProductCategoryKey,
  SkinTone,
  LashStyle,
  HairStyle,
  Scene,
  Composition,
  AspectRatio,
  Vibe,
  LogoOverlaySettings,
  SeasonalSelection,
  GenerateResponse,
  GenerateErrorResponse,
  GeneratedImage,
} from "@/lib/types";

// ── Default Form State ───────────────────────────────────────
const DEFAULT_SELECTIONS: GenerationSelections = {
  category: "lifestyle",
  skinTone: "random",
  lashStyle: "natural",
  hairStyle: "random",
  scene: "studio",
  composition: "solo",
  aspectRatio: "4:5",
  vibe: "confident-glam",
  logoOverlay: {
    enabled: false,
    position: "bottom-right",
    variant: "white",
    opacity: 0.9,
    paddingPercent: 4,
    sizePercent: 15,
  },
  contextNote: "",
};

// ── Component ────────────────────────────────────────────────
export function GenerateForm() {
  const [selections, setSelections] =
    useState<GenerationSelections>(DEFAULT_SELECTIONS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [generationTime, setGenerationTime] = useState(0);
  const [error, setError] = useState<GenerateErrorResponse | null>(null);

  // Update individual fields
  const update = useCallback(
    <K extends keyof GenerationSelections>(
      key: K,
      value: GenerationSelections[K]
    ) => {
      setSelections((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Handle category change — reset scene based on category
  const handleCategoryChange = useCallback((category: ContentCategory) => {
    setSelections((prev) => ({
      ...prev,
      category,
      // Auto-select studio for lash close-ups
      scene: category === "lash-closeup" ? "studio" : prev.scene,
      // Reset composition to solo for non-lifestyle
      composition: category !== "lifestyle" ? "solo" : prev.composition,
    }));
  }, []);

  // Generate image
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selections),
      });

      const data = await response.json();

      if (!response.ok) {
        const errData = data as GenerateErrorResponse;
        setError(errData);
        toast.error(errData.error || "Generation failed");
        return;
      }

      const result = data as GenerateResponse;
      setGeneratedImage(result.image);
      setGenerationTime(result.generationTimeMs);
      toast.success("Image generated successfully!");
    } catch {
      setError({
        error: "Failed to connect to the server. Please try again.",
        code: "UNKNOWN",
      });
      toast.error("Network error — please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset to generate another
  const handleGenerateAnother = () => {
    setGeneratedImage(null);
    setError(null);
    setGenerationTime(0);
  };

  return (
    <>
      {/* Generation progress overlay */}
      <GenerationProgress isVisible={isGenerating} />

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* Left column — Selectors */}
        <div className="space-y-6">
          {/* Category */}
          <CategorySelector
            value={selections.category}
            onChange={handleCategoryChange}
          />

          {/* Product Sub-Category (only when Product is selected) */}
          {selections.category === "product" && (
            <ProductSubCategorySelector
              value={selections.productSubCategory}
              onChange={(v: ProductCategoryKey) =>
                update("productSubCategory", v)
              }
            />
          )}

          {/* Seasonal / Holiday Preset (available for all categories) */}
          <SeasonalSelector
            value={selections.seasonal || { presetSlug: null, selectedProps: [] }}
            onChange={(v: SeasonalSelection) => update("seasonal", v)}
          />

          {/* Skin Tone (for lash-closeup and lifestyle) */}
          {selections.category !== "product" && (
            <SkinToneSelector
              value={selections.skinTone}
              onChange={(v: SkinTone) => update("skinTone", v)}
            />
          )}

          {/* Lash Style */}
          <LashStyleSelector
            value={selections.lashStyle}
            onChange={(v: LashStyle) => update("lashStyle", v)}
          />

          {/* Hair Style (for lifestyle) */}
          {selections.category === "lifestyle" && (
            <HairStyleSelector
              value={selections.hairStyle}
              onChange={(v: HairStyle) => update("hairStyle", v)}
            />
          )}

          {/* Scene */}
          <SceneSelector
            value={selections.scene}
            onChange={(v: Scene) => update("scene", v)}
            category={selections.category}
          />

          {/* Vibe (lifestyle only) */}
          <VibeSelector
            value={selections.vibe}
            onChange={(v: Vibe) => update("vibe", v)}
            category={selections.category}
          />

          {/* Composition (lifestyle only) */}
          <CompositionSelector
            value={selections.composition}
            onChange={(v: Composition) => update("composition", v)}
            category={selections.category}
          />

          {/* Aspect Ratio */}
          <AspectRatioSelector
            value={selections.aspectRatio}
            onChange={(v: AspectRatio) => update("aspectRatio", v)}
          />

          {/* Logo Overlay */}
          <LogoOverlayToggle
            value={selections.logoOverlay}
            onChange={(v: LogoOverlaySettings) => update("logoOverlay", v)}
          />

          {/* Context Note */}
          <ContextNoteInput
            value={selections.contextNote || ""}
            onChange={(v) => update("contextNote", v)}
          />

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full gap-2 bg-coco-golden py-6 text-base font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
            size="lg"
          >
            {isGenerating ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Creating your CocoLash image...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generate Image
              </>
            )}
          </Button>

          {!isGenerating && (
            <p className="text-center text-xs text-coco-brown-medium/50">
              Usually takes 5–15 seconds
            </p>
          )}
        </div>

        {/* Right column — Preview / Result */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          {error && !generatedImage && (
            <ErrorDisplay error={error} onRetry={handleGenerate} />
          )}

          {generatedImage && (
            <ImagePreview
              image={generatedImage}
              generationTimeMs={generationTime}
              onGenerateAnother={handleGenerateAnother}
            />
          )}

          {!generatedImage && !error && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-coco-beige-dark bg-white/50 p-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
                <Sparkles className="h-8 w-8 text-coco-golden/40" />
              </div>
              <p className="mt-4 text-sm font-medium text-coco-brown-medium/50">
                Your generated image will appear here
              </p>
              <p className="mt-1 text-xs text-coco-brown-medium/30">
                Choose your settings and hit Generate
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
