"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ImageIcon,
  Sparkles,
  Shuffle,
  Check,
  RefreshCw,
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
import { CapabilityCard } from "../CapabilityCard";

interface UgcModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
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
 * Phase 34.1 (R-34.1-03): Step 2 is AVATAR-ONLY.
 *
 * Product images are now chosen in Step 1 (ProductReferencePicker → state
 * .ugcProductImageUrls). This step's single job is to produce the influencer
 * image (state.ugcInfluencerImageUrl) via one of three tabs:
 *   - Generate: synthesize a UGC avatar from look traits.
 *   - Gallery: reuse an avatar previously generated in this pipeline.
 *   - Upload: bring your own influencer image.
 *
 * Continuing always routes through the Enhancor-parity vision pipeline in
 * Step 3 (influencer + products[]) — the legacy single-image compose path is
 * gone for UGC.
 */
export function UgcMode({ state, setState, onReady }: UgcModeProps) {
  const [activeTab, setActiveTab] = useState<"generate" | "gallery" | "upload">(
    "generate"
  );

  // Avatar look params
  const [ethnicity, setEthnicity] = useState<UGCEthnicity>("Latina");
  const [skinTone, setSkinTone] = useState<UGCSkinTone>("Medium");
  const [ageRange, setAgeRange] = useState<UGCAgeRange>("25-34");
  const [hairStyle, setHairStyle] = useState<UGCHairStyle>("Wavy");
  const [scene, setScene] = useState<UGCScene>("casual-bedroom");
  const [vibe, setVibe] = useState<UGCVibe>("excited-discovery");
  const [lashStyle, setLashStyle] = useState<LashStyle>("natural");

  // Generated avatar
  const [generatedAvatarUrl, setGeneratedAvatarUrl] = useState<string | null>(null);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

  // Gallery
  const [galleryAvatars, setGalleryAvatars] = useState<GalleryAvatar[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [selectedGalleryUrl, setSelectedGalleryUrl] = useState<string | null>(null);

  // Upload-your-own influencer
  const [uploadedInfluencerUrl, setUploadedInfluencerUrl] = useState<string | null>(null);

  const productCount = state.ugcProductImageUrls?.length ?? 0;

  useEffect(() => {
    if (activeTab === "gallery" && galleryAvatars.length === 0) {
      void fetchGallery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function fetchGallery() {
    setLoadingGallery(true);
    try {
      // Only UGC avatars produced by THIS Seedance pipeline (tag "ugc-avatar").
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
          // Avatar is generated alone; products are separate references (Step 1).
          hasProduct: false,
          aspectRatio: "9:16",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Avatar generation failed");
      setGeneratedAvatarUrl(data.imageUrl);
      toast.success("Avatar generated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar generation failed");
    } finally {
      setIsGeneratingAvatar(false);
    }
  }

  const currentAvatar =
    activeTab === "gallery"
      ? selectedGalleryUrl
      : activeTab === "upload"
      ? uploadedInfluencerUrl
      : generatedAvatarUrl;

  const handleContinue = useCallback(() => {
    const finalAvatar =
      activeTab === "gallery"
        ? selectedGalleryUrl
        : activeTab === "upload"
        ? uploadedInfluencerUrl
        : generatedAvatarUrl;

    if (!finalAvatar) {
      toast.error("Generate, pick, or upload an avatar first.");
      return;
    }
    if ((state.ugcProductImageUrls?.length ?? 0) === 0) {
      toast.error("Go back to Step 1 and select at least one product image.");
      return;
    }

    // Always the Enhancor-parity vision pipeline: influencer + products[].
    setState({
      ugcInfluencerImageUrl: finalAvatar,
      // Clear legacy single-image compose fields so Step 3 uses the vision path.
      ugcComposedImageUrl: undefined,
      ugcWasComposed: false,
      ugcSeparateProductUrl: undefined,
    });
    onReady();
  }, [
    activeTab,
    selectedGalleryUrl,
    uploadedInfluencerUrl,
    generatedAvatarUrl,
    state.ugcProductImageUrls,
    setState,
    onReady,
  ]);

  const canContinue = !!currentAvatar && productCount >= 1;

  return (
    <div className="space-y-6">
      <CapabilityCard mode="ugc" />

      {/* Product recap — products were chosen in Step 1; this step is avatar-only. */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-[11px]",
          productCount > 0
            ? "border-coco-golden/30 bg-coco-golden/5 text-coco-brown-medium"
            : "border-coco-red-500/30 bg-coco-red-500/5 text-coco-red-500"
        )}
      >
        {productCount > 0 ? (
          <>
            <Check className="h-3.5 w-3.5 text-coco-golden" />
            {productCount} product image{productCount !== 1 ? "s" : ""} selected in
            Step 1.
          </>
        ) : (
          <>No product selected — go back to Step 1 and pick at least one.</>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-1.5 rounded-lg bg-coco-beige/50 p-1">
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
        <TabBtn
          active={activeTab === "upload"}
          onClick={() => setActiveTab("upload")}
          icon={Upload}
          label="Upload Influencer"
        />
      </div>

      {activeTab === "generate" && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">Avatar look</h3>
            <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
              These traits define the creator. The avatar is generated alone — the
              products you picked in Step 1 are sent to Seedance as separate
              references.
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
            </div>
          )}
        </section>
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

      {activeTab === "upload" && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">
              Influencer Image <span className="text-coco-golden">*</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
              Bring your own creator/talent image. It becomes the influencer the
              video is built around.
            </p>
          </div>
          <InfluencerPicker
            selectedUrl={uploadedInfluencerUrl}
            onSelect={setUploadedInfluencerUrl}
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

function InfluencerPicker({
  selectedUrl,
  onSelect,
}: {
  selectedUrl: string | null;
  onSelect: (url: string) => void;
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
      const res = await fetch("/api/images/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onSelect(data.image.image_url);
      toast.success("Influencer image uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className={cn(
          "w-full rounded-lg border-2 border-dashed border-coco-beige-dark px-4 py-6 text-center transition-all hover:border-coco-golden/40 hover:bg-coco-golden/5",
          uploading && "opacity-50"
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-coco-golden" />
            <p className="mt-1 text-xs text-coco-brown-medium">Uploading…</p>
          </>
        ) : (
          <>
            <Upload className="mx-auto h-5 w-5 text-coco-brown-medium/60" />
            <p className="mt-1 text-sm font-medium text-coco-brown">
              Click to upload influencer image
            </p>
          </>
        )}
      </button>
      {selectedUrl && (
        <div className="overflow-hidden rounded-lg border-2 border-coco-golden/30 bg-white">
          <img
            src={selectedUrl}
            alt="Selected influencer"
            className="h-64 w-full object-cover"
          />
          <div className="border-t border-coco-beige px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-coco-brown-medium">
              <Check className="h-3.5 w-3.5 text-coco-golden" />
              Influencer image selected
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
