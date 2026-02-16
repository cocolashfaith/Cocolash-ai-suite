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
import { DiversityControls } from "./DiversityControls";
import { ApplicationStepSelector } from "./ApplicationStepSelector";
import { GenerationProgress } from "./GenerationProgress";
import { ImagePreview } from "./ImagePreview";
import { ErrorDisplay } from "./ErrorDisplay";

import type {
  GenerationSelections,
  ContentCategory,
  ProductCategoryKey,
  ApplicationStep,
  SkinTone,
  LashStyle,
  HairStyle,
  Scene,
  Composition,
  AspectRatio,
  Vibe,
  LogoOverlaySettings,
  SeasonalSelection,
  GroupDiversitySelections,
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
  const [beforeImage, setBeforeImage] = useState<GeneratedImage | null>(null);
  const [compositeImageUrl, setCompositeImageUrl] = useState<string | null>(null);
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
      // Auto-select studio for lash close-ups and before-after
      scene: (category === "lash-closeup" || category === "before-after") ? "studio" : prev.scene,
      // Reset composition to solo for non-lifestyle
      composition: category !== "lifestyle" ? "solo" : prev.composition,
      // Default application step when switching to application-process
      applicationStep: category === "application-process" ? (prev.applicationStep || "preparation") : prev.applicationStep,
    }));
  }, []);

  // Generate image
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);
    setBeforeImage(null);
    setCompositeImageUrl(null);

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
      if (result.beforeImage) {
        setBeforeImage(result.beforeImage);
      }
      if (result.compositeImageUrl) {
        setCompositeImageUrl(result.compositeImageUrl);
      }
      setGenerationTime(result.generationTimeMs);
      toast.success(
        result.compositeImageUrl
          ? "Before, After & Composite images generated!"
          : result.beforeImage
            ? "Before & After images generated!"
            : "Image generated successfully!"
      );
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
    setBeforeImage(null);
    setCompositeImageUrl(null);
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

          {/* Application Step Selector (only when Application Process) */}
          {selections.category === "application-process" && (
            <ApplicationStepSelector
              value={selections.applicationStep || "preparation"}
              onChange={(v: ApplicationStep) => update("applicationStep", v)}
            />
          )}

          {/* Before/After info banner + composite toggle */}
          {selections.category === "before-after" && (
            <div className="rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-4">
              <p className="text-sm font-semibold text-coco-brown">
                Two Images Generated
              </p>
              <p className="mt-1 text-xs text-coco-brown-medium/70">
                This will generate a &ldquo;Before&rdquo; (bare lashes) and
                &ldquo;After&rdquo; (CocoLash extensions) image with the same
                model, angle, and lighting. Choose your lash style, skin tone,
                and hair below.
              </p>
              {/* Composite toggle */}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-coco-golden/20 bg-white/60 px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-coco-brown">
                    Side-by-side composite
                  </p>
                  <p className="text-[10px] text-coco-brown-medium/60">
                    Also generate a combined comparison image
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={selections.includeComposite ?? false}
                  onClick={() =>
                    update("includeComposite", !(selections.includeComposite ?? false))
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    selections.includeComposite
                      ? "bg-coco-golden"
                      : "bg-coco-brown-medium/20"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      selections.includeComposite
                        ? "translate-x-[18px]"
                        : "translate-x-[3px]"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Seasonal / Holiday Preset (available for all categories) */}
          <SeasonalSelector
            value={selections.seasonal || { presetSlug: null, selectedProps: [] }}
            onChange={(v: SeasonalSelection) => update("seasonal", v)}
          />

          {/* Skin Tone (for human-featuring categories) */}
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

          {/* Hair Style (for lifestyle, before-after, application-process) */}
          {(selections.category === "lifestyle" ||
            selections.category === "before-after" ||
            selections.category === "application-process") && (
            <HairStyleSelector
              value={selections.hairStyle}
              onChange={(v: HairStyle) => update("hairStyle", v)}
            />
          )}

          {/* Scene (not shown for before-after — fixed studio setting) */}
          {selections.category !== "before-after" &&
            selections.category !== "application-process" && (
            <SceneSelector
              value={selections.scene}
              onChange={(v: Scene) => update("scene", v)}
              category={selections.category}
            />
          )}

          {/* Vibe (lifestyle only) */}
          {selections.category === "lifestyle" && (
            <VibeSelector
              value={selections.vibe}
              onChange={(v: Vibe) => update("vibe", v)}
              category={selections.category}
            />
          )}

          {/* Composition (lifestyle only) */}
          {selections.category === "lifestyle" && (
            <CompositionSelector
              value={selections.composition}
              onChange={(v: Composition) => update("composition", v)}
              category={selections.category}
            />
          )}

          {/* Group Diversity Controls (when composition is "group" + lifestyle) */}
          {selections.category === "lifestyle" &&
            selections.composition === "group" && (
              <DiversityControls
                value={
                  selections.groupDiversity || {
                    groupCount: 3,
                    mode: "diverse-mix",
                    people: [
                      { skinTone: "random", hairStyle: "random" },
                      { skinTone: "random", hairStyle: "random" },
                      { skinTone: "random", hairStyle: "random" },
                    ],
                    ageRange: "same",
                    groupAction: "posing",
                  }
                }
                onChange={(v: GroupDiversitySelections) =>
                  update("groupDiversity", v)
                }
              />
            )}

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
              onRegenerate={handleGenerate}
              beforeImage={beforeImage || undefined}
              compositeImageUrl={compositeImageUrl || undefined}
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
