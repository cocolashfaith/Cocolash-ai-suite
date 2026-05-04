"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  Upload,
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

interface GalleryAvatar {
  id: string;
  image_url: string;
  created_at: string;
}

function pickRandom<T>(arr: readonly { value: T }[]): T {
  return arr[Math.floor(Math.random() * arr.length)].value;
}

/**
 * v4.1 UGC mode — flow corrected per Faith's testing feedback.
 *
 * Two paths driven by the "Show holding product" toggle, which now sits at
 * the TOP of avatar generation as a SETTING (not a tail-end afterthought):
 *
 *   Toggle ON path (NanoBanana composes at gen-time):
 *     1. User picks a product image (inline picker that pops open).
 *     2. User clicks Generate UGC Avatar.
 *     3. Server: Gemini gets the avatar prompt + the product as a reference
 *        image, generates a SINGLE image of the creator already holding the
 *        product. No second composition pass after the fact.
 *     4. After generation: NO product picker below — the product is already
 *        in the image.
 *     5. Only ONE image goes to Seedance.
 *
 *   Toggle OFF path (legacy two-image-to-Seedance):
 *     1. User generates a plain avatar (no product in shot).
 *     2. After generation, a product picker appears BELOW.
 *     3. User selects a product image.
 *     4. BOTH the avatar AND the product image go to Seedance as separate
 *        references — the model handles framing.
 *
 * Plus a third "Select from Gallery" tab that pulls only avatars previously
 * generated in this Seedance UGC pipeline (ugc-avatar tag), not /generate
 * page outputs.
 */
export function UgcMode({ state, setState, onReady }: UgcModeProps) {
  const [activeTab, setActiveTab] = useState<"generate" | "gallery">("generate");

  // Avatar params
  const [ethnicity, setEthnicity] = useState<UGCEthnicity>("Latina");
  const [skinTone, setSkinTone] = useState<UGCSkinTone>("Medium");
  const [ageRange, setAgeRange] = useState<UGCAgeRange>("25-34");
  const [hairStyle, setHairStyle] = useState<UGCHairStyle>("Wavy");
  const [scene, setScene] = useState<UGCScene>("casual-bedroom");
  const [vibe, setVibe] = useState<UGCVibe>("excited-discovery");
  const [lashStyle, setLashStyle] = useState<LashStyle>("natural");

  // Toggle (settings-level, BEFORE generation)
  const [showHoldingProduct, setShowHoldingProduct] = useState(false);

  // Product images
  const [productImages, setProductImages] = useState<ProductRef[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Toggle ON: which product gets composed in at gen-time
  const [composeProductUrl, setComposeProductUrl] = useState<string | null>(null);
  // Toggle OFF: which product goes alongside as a Seedance reference
  const [seedanceProductUrl, setSeedanceProductUrl] = useState<string | null>(null);

  // Avatar state
  const [generatedAvatarUrl, setGeneratedAvatarUrl] = useState<string | null>(null);
  /** When true, the generated avatar already contains the product (toggle-on path). */
  const [generatedHasProduct, setGeneratedHasProduct] = useState(false);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

  // Gallery
  const [galleryAvatars, setGalleryAvatars] = useState<GalleryAvatar[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [selectedGalleryUrl, setSelectedGalleryUrl] = useState<string | null>(null);

  useEffect(() => {
    void fetchProductImages();
  }, []);

  useEffect(() => {
    if (activeTab === "gallery" && galleryAvatars.length === 0) {
      void fetchGallery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  async function fetchGallery() {
    setLoadingGallery(true);
    try {
      // Filter the gallery to UGC avatars produced by THIS Seedance pipeline.
      // The /api/seedance/generate-ugc-image route inserts with tag "ugc-avatar"
      // — assetTag=ugc-avatar limits the query to those rows.
      const res = await fetch(
        "/api/images?limit=24&assetTag=ugc-avatar&sortBy=created_at&sortOrder=desc"
      );
      const data = await res.json();
      if (res.ok) {
        setGalleryAvatars(data.images ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingGallery(false);
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
    if (showHoldingProduct && !composeProductUrl) {
      toast.error('"Show holding product" is on — pick a product first.');
      return;
    }
    setIsGeneratingAvatar(true);
    setGeneratedAvatarUrl(null);
    try {
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
          // hasProduct: false — we don't ask the avatar prompt to invent a
          // product; the actual product image goes via productImageUrl below
          // when the toggle is on.
          hasProduct: false,
          aspectRatio: "9:16",
          productImageUrl: showHoldingProduct ? composeProductUrl : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Avatar generation failed");
      setGeneratedAvatarUrl(data.imageUrl);
      setGeneratedHasProduct(showHoldingProduct);
      toast.success(
        showHoldingProduct
          ? "Avatar generated — composed with the product."
          : "Avatar generated."
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Avatar generation failed"
      );
    } finally {
      setIsGeneratingAvatar(false);
    }
  }

  const handleContinue = useCallback(() => {
    const finalAvatar =
      activeTab === "gallery" ? selectedGalleryUrl : generatedAvatarUrl;
    if (!finalAvatar) {
      toast.error("Generate or pick an avatar first.");
      return;
    }

    // Toggle ON path: avatar already contains the product → ONE image to Seedance
    if (showHoldingProduct && generatedHasProduct) {
      setState({
        ugcComposedImageUrl: finalAvatar,
        ugcWasComposed: true,
      });
      onReady();
      return;
    }

    // Toggle OFF path: avatar + product as separate references to Seedance
    if (!seedanceProductUrl) {
      toast.error("Pick a product image to send to Seedance.");
      return;
    }
    setState({
      ugcComposedImageUrl: finalAvatar,
      ugcWasComposed: false,
      ugcSeparateProductUrl: seedanceProductUrl,
    });
    onReady();
  }, [
    activeTab,
    selectedGalleryUrl,
    generatedAvatarUrl,
    generatedHasProduct,
    showHoldingProduct,
    seedanceProductUrl,
    setState,
    onReady,
  ]);

  const showSeedanceProductPicker =
    activeTab === "generate"
      ? !showHoldingProduct && !!generatedAvatarUrl
      : !!selectedGalleryUrl; // gallery avatars never include the product

  const canContinue =
    (activeTab === "gallery" ? selectedGalleryUrl : generatedAvatarUrl) &&
    (showHoldingProduct
      ? generatedHasProduct // toggle-on must have generated WITH product
      : !!seedanceProductUrl);

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
        <TabBtn
          active={activeTab === "generate"}
          onClick={() => setActiveTab("generate")}
          icon={Sparkles}
          label="Generate UGC Avatar"
        />
        <TabBtn
          active={activeTab === "gallery"}
          onClick={() => setActiveTab("gallery")}
          icon={ImageIcon}
          label="Select from Gallery"
        />
      </div>

      {activeTab === "generate" && (
        <>
          {/* TOGGLE — at the TOP, as a SETTING for avatar generation */}
          <section
            className={cn(
              "space-y-3 rounded-xl border-2 p-4 transition-colors",
              showHoldingProduct
                ? "border-coco-golden bg-coco-golden/5"
                : "border-coco-beige-dark/50 bg-white/50"
            )}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const next = !showHoldingProduct;
                  setShowHoldingProduct(next);
                  if (!next) setComposeProductUrl(null);
                  // Toggling invalidates any prior generated avatar
                  setGeneratedAvatarUrl(null);
                  setGeneratedHasProduct(false);
                }}
                className={cn(
                  "flex h-5 w-9 items-center rounded-full transition-colors",
                  showHoldingProduct ? "bg-coco-golden" : "bg-coco-beige-dark"
                )}
                aria-pressed={showHoldingProduct}
              >
                <div
                  className={cn(
                    "h-4 w-4 rounded-full bg-white shadow transition-transform",
                    showHoldingProduct ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
              <div className="flex-1">
                <p className="text-sm font-semibold text-coco-brown">
                  Show holding product in image
                </p>
                <p className="text-[11px] text-coco-brown-medium/60">
                  {showHoldingProduct
                    ? "Pick a product below — it will be composed into the avatar at generation time. ONE image goes to Seedance."
                    : "Off — avatar is generated alone. You'll pick a product reference below afterward; both go to Seedance separately."}
                </p>
              </div>
            </div>

            {showHoldingProduct && (
              <ProductPicker
                images={productImages}
                loading={loadingProducts}
                selectedUrl={composeProductUrl}
                onSelect={(url) => {
                  setComposeProductUrl(url);
                  // Invalidate any prior generated avatar so user re-generates
                  setGeneratedAvatarUrl(null);
                  setGeneratedHasProduct(false);
                }}
                onProductUploaded={(np) => {
                  setProductImages((prev) => [np, ...prev]);
                }}
              />
            )}
          </section>

          {/* Avatar generator */}
          <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
            <div>
              <h3 className="text-sm font-semibold text-coco-brown">Avatar look</h3>
              <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
                {showHoldingProduct
                  ? "These traits define the creator. The selected product will be composed into the result."
                  : "These traits define the creator. The avatar will be alone (no product)."}
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
                disabled={
                  isGeneratingAvatar ||
                  (showHoldingProduct && !composeProductUrl)
                }
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
              <Button
                onClick={handleRandomize}
                variant="outline"
                size="lg"
                className="gap-2 py-5"
              >
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
                {generatedHasProduct && (
                  <div className="border-t border-coco-beige px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] text-coco-brown-medium">
                      <Check className="h-3.5 w-3.5 text-coco-golden" />
                      Composed with the selected product. ONE image will go to
                      Seedance.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === "gallery" && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">
              Your Seedance UGC avatars
            </h3>
            <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
              Avatars previously generated in this Seedance UGC pipeline.
              (Doesn&apos;t include images from the Generate page or Brand Content
              Studio pipeline.)
            </p>
          </div>
          {loadingGallery ? (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
              <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
              <span className="ml-2 text-xs text-coco-brown-medium/50">
                Loading gallery…
              </span>
            </div>
          ) : galleryAvatars.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
              <ImageIcon className="h-8 w-8 text-coco-brown-medium/30" />
              <p className="mt-2 text-xs text-coco-brown-medium/50">
                No UGC avatars yet — generate one first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {galleryAvatars.map((img) => {
                const isSelected = selectedGalleryUrl === img.image_url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setSelectedGalleryUrl(img.image_url)}
                    className={cn(
                      "group relative aspect-[9/16] overflow-hidden rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-coco-golden ring-2 ring-coco-golden/30"
                        : "border-transparent hover:border-coco-golden/40"
                    )}
                  >
                    <img
                      src={img.image_url}
                      alt="UGC avatar"
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
        </section>
      )}

      {/* Bottom product picker — only shown when toggle is OFF and we have an avatar.
          Toggle-ON path: product is already in the avatar; no second picker. */}
      {showSeedanceProductPicker && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">
              Product reference for Seedance
            </h3>
            <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
              Both the avatar AND this product image will be sent to Seedance
              as separate references — the model will frame them naturally.
            </p>
          </div>
          <ProductPicker
            images={productImages}
            loading={loadingProducts}
            selectedUrl={seedanceProductUrl}
            onSelect={setSeedanceProductUrl}
            onProductUploaded={(np) => {
              setProductImages((prev) => [np, ...prev]);
            }}
          />
        </section>
      )}

      <Button
        onClick={handleContinue}
        disabled={!canContinue || isGeneratingAvatar}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}

function ProductPicker({
  images,
  loading,
  selectedUrl,
  onSelect,
  onProductUploaded,
}: {
  images: ProductRef[];
  loading: boolean;
  selectedUrl: string | null;
  onSelect: (url: string) => void;
  /** Called after a successful upload — append the new product to the picker
   *  list and auto-select it. Caller is expected to update its product list. */
  onProductUploaded?: (newProduct: ProductRef) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/products/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const newProduct: ProductRef = {
        id: data.image.id,
        image_url: data.image.image_url,
        category_name: data.image.category_name ?? "Custom Uploads",
      };
      onProductUploaded?.(newProduct);
      onSelect(newProduct.image_url);
      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success("Product image added — saved for next time.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const showEmptyState = !loading && images.length === 0;

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
      {loading ? (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
          <Loader2 className="h-4 w-4 animate-spin text-coco-brown-medium/40" />
          <span className="ml-2 text-xs text-coco-brown-medium/50">
            Loading products…
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {/* Upload tile — always first so it's discoverable */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-coco-beige-dark bg-white text-coco-brown-medium/60 transition-all hover:border-coco-golden/40 hover:bg-coco-golden/5",
                uploading && "opacity-50"
              )}
              title="Upload a new product image"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span className="text-[10px] font-medium">Upload</span>
                </>
              )}
            </button>
            {images.slice(0, 23).map((img) => {
              const isSelected = selectedUrl === img.image_url;
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onSelect(img.image_url)}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                    isSelected
                      ? "border-coco-golden ring-2 ring-coco-golden/30"
                      : "border-transparent hover:border-coco-golden/40"
                  )}
                  title={img.category_name}
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
          {showEmptyState && (
            <div className="rounded-lg border border-dashed border-coco-beige-dark bg-coco-beige-light/40 p-3 text-center">
              <Package className="mx-auto h-5 w-5 text-coco-brown-medium/40" />
              <p className="mt-1 text-[11px] text-coco-brown-medium/60">
                No saved products yet. Upload one above —{" "}
                <Link
                  href="/settings"
                  className="font-medium text-coco-golden hover:text-coco-golden-dark"
                >
                  <Settings className="inline h-3 w-3" /> manage in Settings
                </Link>
                .
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-medium transition-all",
        active
          ? "bg-white text-coco-brown shadow-sm"
          : "text-coco-brown-medium/50 hover:text-coco-brown-medium"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
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
