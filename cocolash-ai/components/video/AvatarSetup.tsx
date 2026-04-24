"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  ImageIcon,
  Hand,
  Brush,
  Camera,
  MessageCircle,
  RefreshCw,
  Check,
  Upload,
  Package,
  Link as LinkIcon,
  ChevronDown,
  Sparkles,
  Settings,
  Shuffle,
  Wand2,
  Monitor,
  Smartphone,
  Square,
  Layers,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadProductImage } from "@/lib/supabase/storage";
import { LASH_STYLE_OPTIONS } from "@/lib/prompts/modules/lash-styles";
import type {
  CampaignType,
  CompositionPose,
  GenerationSelections,
  LashStyle,
  VideoAspectRatio,
} from "@/lib/types";
import {
  campaignNeedsComposition,
  getCompositionPosesForCampaign,
  getUgcVibeOptionsForCampaign,
} from "@/lib/video/heygen-campaign";
import {
  UGC_ETHNICITY_OPTIONS,
  UGC_SKIN_TONE_OPTIONS,
  UGC_AGE_RANGE_OPTIONS,
  UGC_HAIR_STYLE_OPTIONS,
  UGC_SCENE_OPTIONS,
  type UGCEthnicity,
  type UGCSkinTone,
  type UGCAgeRange,
  type UGCHairStyle,
  type UGCScene,
  type UGCVibe,
} from "@/lib/seedance/ugc-image-prompt";
import {
  STUDIO_SCENE_OPTIONS,
  STUDIO_OUTFIT_OPTIONS,
  STUDIO_FRAMING_OPTIONS,
  STUDIO_EXPRESSION_OPTIONS,
  getScenesForCampaign,
  type StudioScene,
  type StudioOutfit,
  type StudioFraming,
  type StudioExpression,
} from "@/lib/heygen/studio-avatar-prompt";

interface AvatarSetupProps {
  campaignType: CampaignType;
  aspectRatio: VideoAspectRatio;
  onAspectRatioChange: (ratio: VideoAspectRatio) => void;
  initialPersonImageUrl?: string;
  initialPersonImageId?: string;
  onCompositionReady: (data: {
    personImageUrl: string;
    personImageId?: string;
    productImageUrl: string;
    composedImageUrl: string;
    pose: CompositionPose;
    /** Use server-side pre-built composition (skip re-compose on video generate) */
    preComposed?: boolean;
    /** When true, the person image is used directly as the HeyGen avatar (no composition) */
    skipComposition?: boolean;
  }) => void;
}

interface GalleryImage {
  id: string;
  image_url: string;
  category: string;
  created_at: string;
  selections?: GenerationSelections;
  tags?: string[] | null;
}

interface ProductRefImage {
  id: string;
  image_url: string;
  category_name: string;
}

const POSE_META: Record<
  CompositionPose,
  { label: string; description: string; icon: React.ElementType }
> = {
  holding: { label: "Holding", description: "Product at chest level", icon: Hand },
  applying: { label: "Applying", description: "Application tutorial", icon: Brush },
  selfie: { label: "Selfie", description: "Social media style", icon: Camera },
  testimonial: { label: "Testimonial", description: "Review/talk to camera", icon: MessageCircle },
};

type ProductTab = "my-products" | "upload" | "url";
type PersonTab = "gallery" | "generate";
type GallerySource = "studio" | "ugc-avatar" | "heygen-composition" | "studio-avatar";

function pickRandom<T>(arr: readonly { value: T }[]): T {
  return arr[Math.floor(Math.random() * arr.length)].value;
}

export function AvatarSetup({
  campaignType,
  aspectRatio,
  onAspectRatioChange,
  initialPersonImageUrl,
  initialPersonImageId,
  onCompositionReady,
}: AvatarSetupProps) {
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [gallerySource, setGallerySource] = useState<GallerySource>("studio-avatar");
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(
    initialPersonImageId ?? null
  );
  const [selectedPersonUrl, setSelectedPersonUrl] = useState<string | null>(
    initialPersonImageUrl ?? null
  );
  const [productImageUrl, setProductImageUrl] = useState("");
  const [pose, setPose] = useState<CompositionPose>("holding");
  const [isComposing, setIsComposing] = useState(false);
  const [composedImageUrl, setComposedImageUrl] = useState<string | null>(null);
  const [compositionReuseMode, setCompositionReuseMode] = useState(false);

  const needsComposition = useMemo(
    () => campaignNeedsComposition(campaignType),
    [campaignType]
  );

  const poseOptions = useMemo(() => {
    return getCompositionPosesForCampaign(campaignType).map((value) => ({
      value,
      ...POSE_META[value],
    }));
  }, [campaignType]);

  const vibeOptions = useMemo(
    () => getUgcVibeOptionsForCampaign(campaignType),
    [campaignType]
  );

  // Person tab state
  const [personTab, setPersonTab] = useState<PersonTab>(
    initialPersonImageUrl ? "gallery" : "gallery"
  );

  // UGC generation state
  const [ugcEthnicity, setUgcEthnicity] = useState<UGCEthnicity>("Black");
  const [ugcSkinTone, setUgcSkinTone] = useState<UGCSkinTone>("Medium");
  const [ugcAgeRange, setUgcAgeRange] = useState<UGCAgeRange>("25-34");
  const [ugcHairStyle, setUgcHairStyle] = useState<UGCHairStyle>("Wavy");
  const [ugcScene, setUgcScene] = useState<UGCScene>("bathroom-mirror");
  const [ugcVibe, setUgcVibe] = useState<UGCVibe>("excited-discovery");
  const [ugcLashStyle, setUgcLashStyle] = useState<LashStyle>("natural");
  const [isGeneratingUgc, setIsGeneratingUgc] = useState(false);
  const [generatedUgcUrl, setGeneratedUgcUrl] = useState<string | null>(null);

  // Studio avatar generation state (HeyGen pipeline)
  const [studioScene, setStudioScene] = useState<StudioScene>("warm-minimal-studio");
  const [studioOutfit, setStudioOutfit] = useState<StudioOutfit>("professional-blazer");
  const [studioFraming, setStudioFraming] = useState<StudioFraming>("head-chest");
  const [studioExpression, setStudioExpression] = useState<StudioExpression>("confident-teacher");
  const [studioCustomPrompt, setStudioCustomPrompt] = useState("");
  const [isGeneratingStudio, setIsGeneratingStudio] = useState(false);
  const [generatedStudioUrl, setGeneratedStudioUrl] = useState<string | null>(null);

  const isHeygenPipeline = !needsComposition;

  const filteredSceneOptions = useMemo(
    () => {
      const campaignScenes = getScenesForCampaign(campaignType);
      const campaignSceneSet = new Set(campaignScenes);
      return STUDIO_SCENE_OPTIONS.filter((o) => campaignSceneSet.has(o.value));
    },
    [campaignType]
  );

  // Product picker state
  const [productTab, setProductTab] = useState<ProductTab>("my-products");
  const [productImages, setProductImages] = useState<ProductRefImage[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProductImages();
  }, []);

  useEffect(() => {
    fetchGalleryImages();
  }, [gallerySource]);

  useEffect(() => {
    setPose((prev) =>
      poseOptions.some((p) => p.value === prev) ? prev : poseOptions[0]!.value
    );
  }, [poseOptions]);

  useEffect(() => {
    setUgcVibe((prev) =>
      vibeOptions.some((v) => v.value === prev) ? prev : vibeOptions[0]!.value
    );
  }, [vibeOptions]);

  const fetchGalleryImages = async () => {
    setLoadingGallery(true);
    try {
      const params = new URLSearchParams({
        limit: "24",
        sortBy: "created_at",
        sortOrder: "desc",
        assetTag: gallerySource,
      });
      const res = await fetch(`/api/images?${params}`);
      const data = await res.json();
      if (res.ok) {
        setGalleryImages((data.images ?? []) as GalleryImage[]);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingGallery(false);
    }
  };

  const fetchProductImages = async () => {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/product-categories");
      const data = await res.json();
      if (res.ok && data.categories) {
        const all: ProductRefImage[] = [];
        for (const cat of data.categories) {
          for (const img of cat.images ?? []) {
            all.push({
              id: img.id,
              image_url: img.image_url,
              category_name: cat.name ?? cat.slug ?? "",
            });
          }
        }
        setProductImages(all);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingProducts(false);
    }
  };

  const parseSavedComposition = (img: GalleryImage) => {
    const a = img.selections?.heygenAsset;
    if (
      a?.kind === "heygen-composition" &&
      a.personImageUrl &&
      a.productImageUrl &&
      a.pose
    ) {
      return {
        personImageUrl: a.personImageUrl,
        productImageUrl: a.productImageUrl,
        pose: a.pose,
      };
    }
    return null;
  };

  const handleSelectPerson = (img: GalleryImage) => {
    if (gallerySource === "heygen-composition") {
      const meta = parseSavedComposition(img);
      if (!meta) {
        toast.error("This composition is missing saved metadata");
        return;
      }
      setCompositionReuseMode(true);
      setSelectedPersonId(null);
      setSelectedPersonUrl(meta.personImageUrl);
      setProductImageUrl(meta.productImageUrl);
      setPose(meta.pose);
      setComposedImageUrl(img.image_url);
      return;
    }
    setCompositionReuseMode(false);
    setSelectedPersonId(img.id);
    setSelectedPersonUrl(img.image_url);
    setComposedImageUrl(null);
  };

  const handleRandomizeUgc = () => {
    setUgcEthnicity(pickRandom(UGC_ETHNICITY_OPTIONS));
    setUgcSkinTone(pickRandom(UGC_SKIN_TONE_OPTIONS));
    setUgcAgeRange(pickRandom(UGC_AGE_RANGE_OPTIONS));
    setUgcHairStyle(pickRandom(UGC_HAIR_STYLE_OPTIONS));
    setUgcScene(pickRandom(UGC_SCENE_OPTIONS));
    setUgcVibe(pickRandom(vibeOptions));
    setUgcLashStyle(pickRandom(LASH_STYLE_OPTIONS));
  };

  const handleGenerateUgcAvatar = async () => {
    setIsGeneratingUgc(true);
    setGeneratedUgcUrl(null);
    try {
      const res = await fetch("/api/seedance/generate-ugc-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ethnicity: ugcEthnicity,
          skinTone: ugcSkinTone,
          ageRange: ugcAgeRange,
          hairStyle: ugcHairStyle,
          scene: ugcScene,
          vibe: ugcVibe,
          lashStyle: ugcLashStyle,
          hasProduct: false,
          aspectRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");

      setGeneratedUgcUrl(data.imageUrl);
      setSelectedPersonId(data.galleryImageId ?? null);
      setSelectedPersonUrl(data.imageUrl);
      setComposedImageUrl(null);
      setCompositionReuseMode(false);
      toast.success("UGC avatar generated!");
      fetchGalleryImages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate avatar");
    } finally {
      setIsGeneratingUgc(false);
    }
  };

  const handleRandomizeStudio = () => {
    setUgcEthnicity(pickRandom(UGC_ETHNICITY_OPTIONS));
    setUgcSkinTone(pickRandom(UGC_SKIN_TONE_OPTIONS));
    setUgcAgeRange(pickRandom(UGC_AGE_RANGE_OPTIONS));
    setUgcHairStyle(pickRandom(UGC_HAIR_STYLE_OPTIONS));
    setStudioScene(pickRandom(filteredSceneOptions));
    setStudioOutfit(pickRandom(STUDIO_OUTFIT_OPTIONS));
    setStudioExpression(pickRandom(STUDIO_EXPRESSION_OPTIONS));
    setUgcLashStyle(pickRandom(LASH_STYLE_OPTIONS));
  };

  const handleGenerateStudioAvatar = async () => {
    setIsGeneratingStudio(true);
    setGeneratedStudioUrl(null);
    try {
      const res = await fetch("/api/heygen/generate-studio-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ethnicity: ugcEthnicity,
          skinTone: ugcSkinTone,
          ageRange: ugcAgeRange,
          hairStyle: ugcHairStyle,
          scene: studioScene,
          outfit: studioOutfit,
          framing: studioFraming,
          expression: studioExpression,
          lashStyle: ugcLashStyle,
          customPrompt: studioCustomPrompt.trim() || undefined,
          aspectRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Studio avatar generation failed");

      setGeneratedStudioUrl(data.imageUrl);
      setSelectedPersonId(data.galleryImageId ?? null);
      setSelectedPersonUrl(data.imageUrl);
      setComposedImageUrl(null);
      setCompositionReuseMode(false);
      toast.success("Studio avatar generated!");
      fetchGalleryImages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate studio avatar");
    } finally {
      setIsGeneratingStudio(false);
    }
  };

  const handleSelectProduct = (url: string) => {
    setCompositionReuseMode(false);
    setProductImageUrl(url);
    setComposedImageUrl(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const result = await uploadProductImage(supabase, file, Date.now());
      setProductImageUrl(result.url);
      setComposedImageUrl(null);
      toast.success("Product image uploaded");
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCompose = async () => {
    if (!selectedPersonUrl || !productImageUrl.trim()) {
      toast.error("Please select a person image and a product image");
      return;
    }

    setIsComposing(true);
    setComposedImageUrl(null);

    try {
      const res = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "compose-only",
          personImageUrl: selectedPersonUrl,
          personImageId: selectedPersonId,
          productImageUrl: productImageUrl.trim(),
          pose,
          aspectRatio,
          saveToGallery: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.composedImageUrl) {
        throw new Error(data.error ?? "Composition failed");
      }

      setComposedImageUrl(data.composedImageUrl);
      toast.success("Composition created!");
      fetchGalleryImages();
    } catch (err) {
      console.error("Composition error:", err);
      toast.error(
        err instanceof Error ? err.message : "Composition failed — please try again."
      );
    } finally {
      setIsComposing(false);
    }
  };

  const handleContinueSimple = () => {
    if (!selectedPersonUrl) {
      toast.error("Please select a person image");
      return;
    }
    onCompositionReady({
      personImageUrl: selectedPersonUrl,
      personImageId: selectedPersonId ?? undefined,
      productImageUrl: "",
      composedImageUrl: selectedPersonUrl,
      pose: "holding",
      preComposed: true,
      skipComposition: true,
    });
  };

  const handleContinue = () => {
    if (!needsComposition) {
      handleContinueSimple();
      return;
    }

    if (!selectedPersonUrl || !productImageUrl.trim()) {
      toast.error("Please complete all selections");
      return;
    }

    if (compositionReuseMode) {
      if (!composedImageUrl) {
        toast.error("Missing composition image");
        return;
      }
      onCompositionReady({
        personImageUrl: selectedPersonUrl,
        personImageId: selectedPersonId ?? undefined,
        productImageUrl: productImageUrl.trim(),
        composedImageUrl,
        pose,
        preComposed: true,
      });
      return;
    }

    if (!composedImageUrl) {
      toast.error("Preview composition first");
      return;
    }

    onCompositionReady({
      personImageUrl: selectedPersonUrl,
      personImageId: selectedPersonId ?? undefined,
      productImageUrl: productImageUrl.trim(),
      composedImageUrl,
      pose,
      preComposed: false,
    });
  };

  const hasInitialImage = !!initialPersonImageUrl;

  const ASPECT_OPTIONS: {
    value: VideoAspectRatio;
    label: string;
    icon: React.ElementType;
  }[] = [
    { value: "9:16", label: "9:16", icon: Smartphone },
    { value: "1:1", label: "1:1", icon: Square },
    { value: "16:9", label: "16:9", icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      {/* Frame ratio — used for UGC generation, composition preview, and video */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">Frame ratio</label>
        <p className="text-xs text-coco-brown-medium/60">
          Applies to new UGC avatars, composition preview, and your final video
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ASPECT_OPTIONS.map((ar) => {
            const Icon = ar.icon;
            const active = aspectRatio === ar.value;
            return (
              <button
                key={ar.value}
                type="button"
                onClick={() => onAspectRatioChange(ar.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-center transition-all",
                  active
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-coco-golden" : "text-coco-brown-medium")} />
                <span className={cn("text-xs font-semibold", active ? "text-coco-brown" : "text-coco-brown-medium")}>
                  {ar.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Person Image Selection */}
      <div className="space-y-2">
          <label className="text-sm font-semibold text-coco-brown">
          Person Image
        </label>
        <p className="text-xs text-coco-brown-medium/60">
          {isHeygenPipeline
            ? "Select an existing image or generate a new studio-quality avatar"
            : "Select an existing image or generate a new UGC-style avatar"}
        </p>

        {/* Person Tab Buttons */}
        <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
          <TabButton
            active={personTab === "gallery"}
            onClick={() => setPersonTab("gallery")}
            icon={ImageIcon}
            label="Select from Gallery"
          />
          <TabButton
            active={personTab === "generate"}
            onClick={() => setPersonTab("generate")}
            icon={Wand2}
            label={isHeygenPipeline ? "Generate Studio Avatar" : "Generate UGC Avatar"}
          />
        </div>

        {/* Tab: Gallery */}
        {personTab === "gallery" && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {(
                isHeygenPipeline
                  ? [
                      { id: "studio-avatar" as GallerySource, label: "Studio Avatars", icon: Sparkles },
                      { id: "ugc-avatar" as GallerySource, label: "UGC avatars", icon: Wand2 },
                    ]
                  : [
                      { id: "studio" as GallerySource, label: "Studio", icon: Sparkles },
                      { id: "ugc-avatar" as GallerySource, label: "UGC avatars", icon: Wand2 },
                      { id: "heygen-composition" as GallerySource, label: "Saved compositions", icon: Layers },
                    ]
              ).map((src) => {
                const Icon = src.icon;
                const active = gallerySource === src.id;
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => {
                      setGallerySource(src.id);
                      setCompositionReuseMode(false);
                      setComposedImageUrl(null);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all",
                      active
                        ? "bg-coco-brown text-white shadow-sm"
                        : "bg-coco-beige-light text-coco-brown-medium hover:bg-coco-beige"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {src.label}
                  </button>
                );
              })}
            </div>

            {loadingGallery ? (
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
                <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
                <span className="ml-2 text-xs text-coco-brown-medium/50">Loading images...</span>
              </div>
            ) : galleryImages.length === 0 && !hasInitialImage ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
                <ImageIcon className="h-8 w-8 text-coco-brown-medium/30" />
                <p className="mt-2 text-xs text-coco-brown-medium/50">
                  {gallerySource === "heygen-composition"
                    ? "No saved compositions yet — preview a composition below to save one here"
                    : gallerySource === "ugc-avatar"
                      ? "No UGC avatars yet — use Generate UGC Avatar"
                      : "No studio images yet — generate some first, or use the Generate tab"}
                </p>
                <Link
                  href="/generate"
                  className="mt-3 flex items-center gap-1.5 rounded-lg bg-coco-golden px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-coco-golden-dark"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Go to Generate
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {gallerySource === "studio" &&
                  hasInitialImage &&
                  !galleryImages.some((g) => g.id === initialPersonImageId) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompositionReuseMode(false);
                        setSelectedPersonId(initialPersonImageId ?? null);
                        setSelectedPersonUrl(initialPersonImageUrl!);
                        setComposedImageUrl(null);
                      }}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                        selectedPersonUrl === initialPersonImageUrl
                          ? "border-coco-golden ring-2 ring-coco-golden/30"
                          : "border-transparent hover:border-coco-golden/40"
                      )}
                    >
                      <img
                        src={initialPersonImageUrl}
                        alt="Selected from Generate"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute left-1 top-1 rounded-full bg-coco-golden/90 px-1.5 py-0.5 text-[8px] font-bold text-white">
                        Selected
                      </div>
                      {selectedPersonUrl === initialPersonImageUrl && (
                        <div className="absolute inset-0 flex items-center justify-center bg-coco-golden/20">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  )}

                {/* Show generated UGC avatar in gallery if available */}
                {(gallerySource === "studio" || gallerySource === "ugc-avatar") &&
                  generatedUgcUrl &&
                  !galleryImages.some((g) => g.image_url === generatedUgcUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompositionReuseMode(false);
                        setSelectedPersonId(null);
                        setSelectedPersonUrl(generatedUgcUrl);
                        setComposedImageUrl(null);
                      }}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                        selectedPersonUrl === generatedUgcUrl
                          ? "border-coco-golden ring-2 ring-coco-golden/30"
                          : "border-transparent hover:border-coco-golden/40"
                      )}
                    >
                      <img
                        src={generatedUgcUrl}
                        alt="Generated UGC Avatar"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute left-1 top-1 rounded-full bg-orange-500/90 px-1.5 py-0.5 text-[8px] font-bold text-white">
                        UGC
                      </div>
                      {selectedPersonUrl === generatedUgcUrl && (
                        <div className="absolute inset-0 flex items-center justify-center bg-coco-golden/20">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  )}

                {galleryImages.map((img) => {
                  const isCompSource = gallerySource === "heygen-composition";
                  const isSelected = isCompSource
                    ? composedImageUrl === img.image_url
                    : selectedPersonId === img.id;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => handleSelectPerson(img)}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                        isSelected
                          ? "border-coco-golden ring-2 ring-coco-golden/30"
                          : "border-transparent hover:border-coco-golden/40"
                      )}
                    >
                      <img
                        src={img.image_url}
                        alt="Generated"
                        className="h-full w-full object-cover"
                      />
                      {isCompSource && (
                        <div className="absolute left-1 top-1 rounded-full bg-purple-600/90 px-1.5 py-0.5 text-[8px] font-bold text-white">
                          Comp
                        </div>
                      )}
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
          </>
        )}

        {/* Tab: Generate Avatar (Studio for HeyGen, UGC for Seedance) */}
        {personTab === "generate" && isHeygenPipeline && (
          <div className="space-y-4 rounded-xl border-2 border-coco-beige-dark bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-coco-brown-medium">
                Customize your studio avatar
              </p>
              <button
                type="button"
                onClick={handleRandomizeStudio}
                className="flex items-center gap-1 rounded-lg bg-coco-beige-light px-2.5 py-1 text-[10px] font-medium text-coco-brown-medium transition-colors hover:bg-coco-beige"
              >
                <Shuffle className="h-3 w-3" />
                Randomize All
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <UgcDropdown label="Ethnicity" value={ugcEthnicity} onChange={(v) => setUgcEthnicity(v as UGCEthnicity)} options={UGC_ETHNICITY_OPTIONS} />
              <UgcDropdown label="Skin Tone" value={ugcSkinTone} onChange={(v) => setUgcSkinTone(v as UGCSkinTone)} options={UGC_SKIN_TONE_OPTIONS} />
              <UgcDropdown label="Age Range" value={ugcAgeRange} onChange={(v) => setUgcAgeRange(v as UGCAgeRange)} options={UGC_AGE_RANGE_OPTIONS} />
              <UgcDropdown label="Hair Style" value={ugcHairStyle} onChange={(v) => setUgcHairStyle(v as UGCHairStyle)} options={UGC_HAIR_STYLE_OPTIONS} />
              <UgcDropdown label="Scene" value={studioScene} onChange={(v) => setStudioScene(v as StudioScene)} options={filteredSceneOptions} />
              <UgcDropdown label="Outfit" value={studioOutfit} onChange={(v) => setStudioOutfit(v as StudioOutfit)} options={STUDIO_OUTFIT_OPTIONS} />
              <UgcDropdown label="Framing" value={studioFraming} onChange={(v) => setStudioFraming(v as StudioFraming)} options={STUDIO_FRAMING_OPTIONS} />
              <UgcDropdown label="Expression" value={studioExpression} onChange={(v) => setStudioExpression(v as StudioExpression)} options={STUDIO_EXPRESSION_OPTIONS} />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-medium text-coco-brown-medium/60">
                Lash style (same as Generate page)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {LASH_STYLE_OPTIONS.map((opt) => {
                  const active = ugcLashStyle === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setUgcLashStyle(opt.value)}
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

            <div>
              <label className="mb-1.5 block text-[10px] font-medium text-coco-brown-medium/60">
                Custom instructions (optional)
              </label>
              <textarea
                value={studioCustomPrompt}
                onChange={(e) => setStudioCustomPrompt(e.target.value)}
                placeholder="e.g. specific jewelry, a particular hairstyle detail, brand-specific styling..."
                rows={2}
                className="w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none placeholder:text-coco-brown-medium/30 focus:border-coco-golden"
              />
            </div>

            {generatedStudioUrl && (
              <div className="overflow-hidden rounded-xl border-2 border-coco-golden/30">
                <div className="flex items-center justify-between border-b border-coco-beige-dark px-3 py-1.5">
                  <span className="text-[10px] font-semibold text-coco-brown">Generated Avatar</span>
                  <span className="flex items-center gap-1 text-[10px] text-green-600">
                    <Check className="h-3 w-3" /> Selected
                  </span>
                </div>
                <div className="aspect-[3/4] bg-coco-beige-light">
                  <img src={generatedStudioUrl} alt="Generated Studio Avatar" className="h-full w-full object-cover" />
                </div>
              </div>
            )}

            <Button
              onClick={handleGenerateStudioAvatar}
              disabled={isGeneratingStudio}
              className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-md hover:bg-coco-golden-dark"
              size="lg"
            >
              {isGeneratingStudio ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating studio avatar...
                </>
              ) : generatedStudioUrl ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate Avatar
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate Studio Avatar
                </>
              )}
            </Button>

            <p className="text-center text-[10px] text-coco-brown-medium/40">
              Uses Gemini to create a professional brand presenter image (~$0.04)
            </p>
          </div>
        )}

        {personTab === "generate" && !isHeygenPipeline && (
          <div className="space-y-4 rounded-xl border-2 border-coco-beige-dark bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-coco-brown-medium">
                Customize your UGC avatar
              </p>
              <button
                type="button"
                onClick={handleRandomizeUgc}
                className="flex items-center gap-1 rounded-lg bg-coco-beige-light px-2.5 py-1 text-[10px] font-medium text-coco-brown-medium transition-colors hover:bg-coco-beige"
              >
                <Shuffle className="h-3 w-3" />
                Randomize All
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <UgcDropdown label="Ethnicity" value={ugcEthnicity} onChange={(v) => setUgcEthnicity(v as UGCEthnicity)} options={UGC_ETHNICITY_OPTIONS} />
              <UgcDropdown label="Skin Tone" value={ugcSkinTone} onChange={(v) => setUgcSkinTone(v as UGCSkinTone)} options={UGC_SKIN_TONE_OPTIONS} />
              <UgcDropdown label="Age Range" value={ugcAgeRange} onChange={(v) => setUgcAgeRange(v as UGCAgeRange)} options={UGC_AGE_RANGE_OPTIONS} />
              <UgcDropdown label="Hair Style" value={ugcHairStyle} onChange={(v) => setUgcHairStyle(v as UGCHairStyle)} options={UGC_HAIR_STYLE_OPTIONS} />
              <UgcDropdown label="Scene" value={ugcScene} onChange={(v) => setUgcScene(v as UGCScene)} options={UGC_SCENE_OPTIONS} />
              <UgcDropdown label="Vibe" value={ugcVibe} onChange={(v) => setUgcVibe(v as UGCVibe)} options={vibeOptions} />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-medium text-coco-brown-medium/60">
                Lash style (same as Generate page)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {LASH_STYLE_OPTIONS.map((opt) => {
                  const active = ugcLashStyle === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setUgcLashStyle(opt.value)}
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

            {generatedUgcUrl && (
              <div className="overflow-hidden rounded-xl border-2 border-coco-golden/30">
                <div className="flex items-center justify-between border-b border-coco-beige-dark px-3 py-1.5">
                  <span className="text-[10px] font-semibold text-coco-brown">Generated Avatar</span>
                  <span className="flex items-center gap-1 text-[10px] text-green-600">
                    <Check className="h-3 w-3" /> Selected
                  </span>
                </div>
                <div className="aspect-[3/4] bg-coco-beige-light">
                  <img src={generatedUgcUrl} alt="Generated UGC Avatar" className="h-full w-full object-cover" />
                </div>
              </div>
            )}

            <Button
              onClick={handleGenerateUgcAvatar}
              disabled={isGeneratingUgc}
              className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-md hover:bg-coco-golden-dark"
              size="lg"
            >
              {isGeneratingUgc ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating avatar...
                </>
              ) : generatedUgcUrl ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate Avatar
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate UGC Avatar
                </>
              )}
            </Button>

            <p className="text-center text-[10px] text-coco-brown-medium/40">
              Uses Gemini to create an authentic iPhone-style selfie (~$0.04)
            </p>
          </div>
        )}
      </div>

      {/* ── Simplified flow for educational campaigns (no composition) ── */}
      {!needsComposition && selectedPersonUrl && (
        <div className="space-y-3 rounded-xl border-2 border-coco-golden/20 bg-coco-golden/5 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coco-golden/10">
              <Check className="h-4 w-4 text-coco-golden" />
            </div>
            <div>
              <p className="text-sm font-semibold text-coco-brown">Presenter selected</p>
              <p className="text-[11px] text-coco-brown-medium/60">
                Brand content uses the presenter image directly — no product composition needed.
              </p>
            </div>
          </div>
          <Button
            onClick={handleContinue}
            className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg hover:bg-coco-golden-dark hover:shadow-xl"
            size="lg"
          >
            Continue to Voice & Style →
          </Button>
        </div>
      )}

      {/* ── Full composition flow (product + pose + compose) ── */}
      {needsComposition && compositionReuseMode && composedImageUrl && (
        <div className="space-y-3 rounded-xl border-2 border-coco-golden/40 bg-coco-golden/5 p-4">
          <p className="text-sm font-semibold text-coco-brown">Using a saved composition</p>
          <p className="text-xs text-coco-brown-medium/70">
            Product and pose are restored from this preview. Continue to voice &amp; style, or cancel to pick a different person.
          </p>
          <div className="overflow-hidden rounded-lg border border-coco-beige-dark bg-white">
            <img src={composedImageUrl} alt="Saved composition" className="max-h-64 w-full object-contain" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleContinue}
              className="gap-2 bg-coco-golden text-white hover:bg-coco-golden-dark"
            >
              Continue with this composition
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCompositionReuseMode(false);
                setComposedImageUrl(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Product Image — Tabbed Picker */}
      {needsComposition && !compositionReuseMode && (
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Product Image
        </label>
        <p className="text-xs text-coco-brown-medium/60">
          Choose a product reference image or upload one
        </p>

        {/* Tab Buttons */}
        <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
          <TabButton
            active={productTab === "my-products"}
            onClick={() => setProductTab("my-products")}
            icon={Package}
            label="My Products"
          />
          <TabButton
            active={productTab === "upload"}
            onClick={() => setProductTab("upload")}
            icon={Upload}
            label="Upload"
          />
        </div>

        {/* Tab Content: My Products */}
        {productTab === "my-products" && (
          <div>
            {loadingProducts ? (
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
                <Loader2 className="h-4 w-4 animate-spin text-coco-brown-medium/40" />
                <span className="ml-2 text-xs text-coco-brown-medium/50">Loading products...</span>
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
                {productImages.map((img) => {
                  const isSelected = productImageUrl === img.image_url;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => handleSelectProduct(img.image_url)}
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

        {/* Tab Content: Upload */}
        {productTab === "upload" && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {productImageUrl && !productImageUrl.startsWith("http") ? null : productImageUrl ? (
              <div className="space-y-2">
                <div className="relative aspect-square w-24 overflow-hidden rounded-lg border-2 border-coco-golden/30">
                  <img
                    src={productImageUrl}
                    alt="Product"
                    className="h-full w-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-xs font-medium text-coco-golden hover:text-coco-golden-dark"
                >
                  Change image
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-coco-beige-dark bg-white p-8 transition-colors hover:border-coco-golden/40"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-coco-golden" />
                    <span className="text-xs text-coco-brown-medium/50">
                      Uploading...
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-coco-brown-medium/30" />
                    <span className="text-xs font-medium text-coco-brown-medium">
                      Click to upload a product image
                    </span>
                    <span className="text-[10px] text-coco-brown-medium/40">
                      PNG, JPG up to 10MB
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Collapsed URL paste fallback */}
        <div>
          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="flex items-center gap-1 text-[11px] text-coco-brown-medium/40 hover:text-coco-brown-medium/60"
          >
            <LinkIcon className="h-3 w-3" />
            Or paste a URL
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                showUrlInput && "rotate-180"
              )}
            />
          </button>
          {showUrlInput && (
            <input
              type="url"
              value={productImageUrl}
              onChange={(e) => {
                setProductImageUrl(e.target.value);
                setComposedImageUrl(null);
              }}
              placeholder="https://... (paste product image URL)"
              className="mt-2 w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none placeholder:text-coco-brown-medium/30 focus:border-coco-golden"
            />
          )}
        </div>
      </div>
      )}

      {needsComposition && !compositionReuseMode && (
      <>
      {/* Pose Selector */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Composition Pose
        </label>
        <p className="text-[11px] text-coco-brown-medium/50">
          Options depend on your campaign type ({campaignType.replace(/-/g, " ")}).
        </p>
        <div className="grid grid-cols-2 gap-3">
          {poseOptions.map((p) => {
            const Icon = p.icon;
            const isActive = pose === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setPose(p.value);
                  setComposedImageUrl(null);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-3 transition-all duration-200",
                  isActive
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    isActive
                      ? "bg-coco-golden text-white"
                      : "bg-coco-beige text-coco-brown-medium"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className={cn("text-xs font-medium", isActive ? "text-coco-brown" : "text-coco-brown-medium")}>
                    {p.label}
                  </p>
                  <p className="text-[10px] text-coco-brown-medium/60">{p.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compose / Preview */}
      {selectedPersonUrl && productImageUrl.trim() && (
        <div className="space-y-3">
          {!composedImageUrl ? (
            <Button
              onClick={handleCompose}
              disabled={isComposing}
              className="w-full gap-2 bg-coco-brown py-5 text-sm font-semibold text-white shadow-md hover:bg-coco-brown-light disabled:opacity-50"
              size="lg"
            >
              {isComposing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating composition...
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" />
                  Preview Composition
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border-2 border-coco-golden/30 bg-white">
                <div className="flex items-center justify-between border-b border-coco-beige-dark px-4 py-2">
                  <span className="text-xs font-semibold text-coco-brown">Composition Preview</span>
                  <button
                    type="button"
                    onClick={() => {
                      setComposedImageUrl(null);
                      handleCompose();
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-coco-golden hover:text-coco-golden-dark"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </button>
                </div>
                <div className="aspect-[4/5] bg-coco-beige-light">
                  <img
                    src={composedImageUrl}
                    alt="Composition preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              <Button
                onClick={handleContinue}
                className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg hover:bg-coco-golden-dark hover:shadow-xl"
                size="lg"
              >
                Use This Composition →
              </Button>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

function TabButton({
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

function UgcDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-coco-brown-medium/60">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-coco-beige-dark bg-white px-2.5 py-1.5 text-xs text-coco-brown outline-none focus:border-coco-golden"
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
