"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  ImageIcon,
  Sparkles,
  Shuffle,
  Check,
  RefreshCw,
  Package,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  UGC_ETHNICITY_OPTIONS,
  UGC_SKIN_TONE_OPTIONS,
  UGC_AGE_RANGE_OPTIONS,
  UGC_HAIR_STYLE_OPTIONS,
  UGC_SCENE_OPTIONS,
  UGC_VIBE_OPTIONS,
  type UGCEthnicity,
  type UGCSkinTone,
  type UGCAgeRange,
  type UGCHairStyle,
  type UGCScene,
  type UGCVibe,
} from "@/lib/seedance/ugc-image-prompt";
import { LASH_STYLE_OPTIONS } from "@/lib/prompts/modules/lash-styles";
import type { LashStyle } from "@/lib/types";
import type { SeedanceV4WizardState } from "../types";

interface UgcModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

interface ProductRef {
  id: string;
  image_url: string;
  category_name: string;
}

function pickRandom<T>(arr: readonly { value: T }[]): T {
  return arr[Math.floor(Math.random() * arr.length)].value;
}

/**
 * v4.0 UGC mode — fixes the three broken behaviors from Phase 14 audit:
 *   BROKEN-01: Toggle ON now shows a product picker (NOT a free-text input).
 *   BROKEN-02: With toggle OFF, no product is required to advance.
 *   BROKEN-04: Gemini composes person+product into ONE image upstream of Seedance.
 *
 * Result: the wizard stores `ugcComposedImageUrl` (single composed image)
 * which is what flows to the Director and to /api/seedance/generate.
 */
export function UgcMode({ state, setState, onReady }: UgcModeProps) {
  const [ethnicity, setEthnicity] = useState<UGCEthnicity>("Latina");
  const [skinTone, setSkinTone] = useState<UGCSkinTone>("Medium");
  const [ageRange, setAgeRange] = useState<UGCAgeRange>("25-34");
  const [hairStyle, setHairStyle] = useState<UGCHairStyle>("Wavy");
  const [scene, setScene] = useState<UGCScene>("casual-bedroom");
  const [vibe, setVibe] = useState<UGCVibe>("excited-discovery");
  const [lashStyle, setLashStyle] = useState<LashStyle>("natural");

  const [hasProduct, setHasProduct] = useState(false);
  const [generatedAvatarUrl, setGeneratedAvatarUrl] = useState<string | null>(null);
  const [selectedProductUrl, setSelectedProductUrl] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<ProductRef[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const composedFromRef = useRef<string | null>(null);

  useEffect(() => {
    void fetchProductImages();
  }, []);

  async function fetchProductImages() {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/product-categories");
      const data = await res.json();
      if (res.ok && data.categories) {
        const all: ProductRef[] = [];
        for (const cat of data.categories) {
          for (const img of cat.images ?? []) {
            all.push({
              id: img.id,
              image_url: img.image_url,
              category_name: cat.name ?? "",
            });
          }
        }
        setProductImages(all);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingProducts(false);
    }
  }

  function handleRandomize() {
    setEthnicity(pickRandom(UGC_ETHNICITY_OPTIONS));
    setSkinTone(pickRandom(UGC_SKIN_TONE_OPTIONS));
    setAgeRange(pickRandom(UGC_AGE_RANGE_OPTIONS));
    setHairStyle(pickRandom(UGC_HAIR_STYLE_OPTIONS));
    setScene(pickRandom(UGC_SCENE_OPTIONS));
    setVibe(pickRandom(UGC_VIBE_OPTIONS));
    setLashStyle(pickRandom(LASH_STYLE_OPTIONS));
    toast.success("Randomized!");
  }

  async function handleGenerateAvatar() {
    setIsGeneratingAvatar(true);
    setGeneratedAvatarUrl(null);
    composedFromRef.current = null;
    try {
      // Generate the BARE avatar — no productDescription, no hasProduct.
      // Compose happens downstream when the user picks a product.
      const res = await fetch("/api/seedance/generate-ugc-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ethnicity,
          skinTone,
          ageRange,
          hairStyle,
          scene,
          vibe,
          lashStyle,
          hasProduct: false, // v4: avatar gen never knows about the product
          aspectRatio: "9:16",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Avatar generation failed");
      setGeneratedAvatarUrl(data.imageUrl);
      toast.success("UGC avatar generated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar generation failed");
    } finally {
      setIsGeneratingAvatar(false);
    }
  }

  /**
   * The CRITICAL v4.0 fix — Gemini composes (avatar + product) into ONE image
   * BEFORE we hand off to the Director / Seedance. The composed URL is
   * what gets stored in wizard state and what Seedance ultimately receives.
   */
  async function handleCompose(): Promise<string | null> {
    if (!generatedAvatarUrl || !selectedProductUrl) return null;
    // Memoize — don't recompose if neither input changed
    const key = `${generatedAvatarUrl}|${selectedProductUrl}`;
    if (composedFromRef.current === key && state.ugcComposedImageUrl) {
      return state.ugcComposedImageUrl;
    }
    setIsComposing(true);
    try {
      // Reuse the existing /api/tryon endpoint pattern by inlining a call
      // to the composition route used for HeyGen avatar+product setup.
      // The HeyGen flow already POSTs to /api/composition for this — verify
      // with a dedicated endpoint if needed.
      const res = await fetch("/api/composition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personImageUrl: generatedAvatarUrl,
          productImageUrl: selectedProductUrl,
          pose: "holding",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.composedImageUrl) {
        throw new Error(data.error || "Composition failed");
      }
      composedFromRef.current = key;
      return data.composedImageUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Composition failed");
      return null;
    } finally {
      setIsComposing(false);
    }
  }

  async function handleContinue() {
    if (!generatedAvatarUrl) {
      toast.error("Generate or pick an avatar first.");
      return;
    }
    if (hasProduct && !selectedProductUrl) {
      toast.error("Pick a product image — the toggle is on.");
      return;
    }

    if (hasProduct) {
      const composedUrl = await handleCompose();
      if (!composedUrl) return;
      setState({
        ugcComposedImageUrl: composedUrl,
        ugcWasComposed: true,
      });
    } else {
      // Avatar-only path — the avatar IS the composed image
      setState({
        ugcComposedImageUrl: generatedAvatarUrl,
        ugcWasComposed: false,
      });
    }
    onReady();
  }

  return (
    <div className="space-y-6">
      {/* Avatar generator */}
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-coco-brown">Avatar</h3>
          <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
            Generate a UGC creator avatar with the look you want.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Dropdown label="Ethnicity" value={ethnicity} options={UGC_ETHNICITY_OPTIONS} onChange={(v) => setEthnicity(v as UGCEthnicity)} />
          <Dropdown label="Skin Tone" value={skinTone} options={UGC_SKIN_TONE_OPTIONS} onChange={(v) => setSkinTone(v as UGCSkinTone)} />
          <Dropdown label="Age Range" value={ageRange} options={UGC_AGE_RANGE_OPTIONS} onChange={(v) => setAgeRange(v as UGCAgeRange)} />
          <Dropdown label="Hair Style" value={hairStyle} options={UGC_HAIR_STYLE_OPTIONS} onChange={(v) => setHairStyle(v as UGCHairStyle)} />
          <Dropdown label="Scene" value={scene} options={UGC_SCENE_OPTIONS} onChange={(v) => setScene(v as UGCScene)} />
          <Dropdown label="Vibe" value={vibe} options={UGC_VIBE_OPTIONS} onChange={(v) => setVibe(v as UGCVibe)} />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium text-coco-brown-medium/60">
            Lash style
          </label>
          <div className="flex flex-wrap gap-1.5">
            {LASH_STYLE_OPTIONS.map((opt) => {
              const active = lashStyle === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLashStyle(opt.value)}
                  className={cn(
                    "rounded-lg border-2 px-2 py-1 text-[10px] font-medium transition-all",
                    active
                      ? "border-coco-golden bg-coco-golden/10 text-coco-brown"
                      : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            onClick={handleGenerateAvatar}
            disabled={isGeneratingAvatar}
            className="flex-1 gap-2 bg-coco-brown py-5 text-sm font-semibold text-white shadow-md hover:bg-coco-brown-light disabled:opacity-50"
            size="lg"
          >
            {isGeneratingAvatar ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : generatedAvatarUrl ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate Avatar
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate UGC Avatar
              </>
            )}
          </Button>
          <Button onClick={handleRandomize} variant="outline" size="lg" className="gap-2 py-5">
            <Shuffle className="h-4 w-4" />
            Randomize
          </Button>
        </div>

        {generatedAvatarUrl && (
          <div className="overflow-hidden rounded-xl border-2 border-coco-golden/30 bg-white">
            <div className="aspect-[9/16] max-h-80 bg-coco-beige-light">
              <img
                src={generatedAvatarUrl}
                alt="UGC Avatar"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        )}
      </section>

      {/* Show holding product — toggle wired to product picker (v4 fix BROKEN-01) */}
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const next = !hasProduct;
              setHasProduct(next);
              if (!next) setSelectedProductUrl(null); // toggle off → forget selection
            }}
            className={cn(
              "flex h-5 w-9 items-center rounded-full transition-colors",
              hasProduct ? "bg-coco-golden" : "bg-coco-beige-dark"
            )}
            aria-pressed={hasProduct}
          >
            <div
              className={cn(
                "h-4 w-4 rounded-full bg-white shadow transition-transform",
                hasProduct ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
          <div>
            <span className="text-sm font-semibold text-coco-brown">
              Show holding product in image
            </span>
            <p className="text-[11px] text-coco-brown-medium/60">
              {hasProduct
                ? "Pick a product — Gemini will compose the avatar holding it into ONE image."
                : "Off — only the avatar image goes to Seedance. No product picker required."}
            </p>
          </div>
        </div>

        {hasProduct && (
          <div className="space-y-2">
            {loadingProducts ? (
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
                <Loader2 className="h-4 w-4 animate-spin text-coco-brown-medium/40" />
                <span className="ml-2 text-xs text-coco-brown-medium/50">
                  Loading products…
                </span>
              </div>
            ) : productImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
                <Package className="h-6 w-6 text-coco-brown-medium/30" />
                <p className="mt-2 text-xs text-coco-brown-medium/50">
                  No product images yet
                </p>
                <Link
                  href="/settings"
                  className="mt-2 flex items-center gap-1 text-[11px] font-medium text-coco-golden hover:text-coco-golden-dark"
                >
                  <Settings className="h-3 w-3" />
                  Add in Settings
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {productImages.slice(0, 24).map((img) => {
                  const isSelected = selectedProductUrl === img.image_url;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedProductUrl(img.image_url)}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                        isSelected
                          ? "border-coco-golden ring-2 ring-coco-golden/30"
                          : "border-transparent hover:border-coco-golden/40"
                      )}
                    >
                      <img
                        src={img.image_url}
                        alt={img.category_name}
                        className="h-full w-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-coco-golden/20">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {isComposing && (
        <div className="rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-4 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-coco-golden" />
          <p className="mt-2 text-xs text-coco-brown-medium">
            Composing avatar + product into one image…
          </p>
        </div>
      )}

      <Button
        onClick={handleContinue}
        disabled={!generatedAvatarUrl || isComposing || (hasProduct && !selectedProductUrl)}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}

function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-coco-brown-medium/60">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none focus:border-coco-golden"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
