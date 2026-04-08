"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  ImageIcon,
  Check,
  Upload,
  Package,
  Link as LinkIcon,
  ChevronDown,
  Sparkles,
  Settings,
  Shuffle,
  Mic,
  Music,
  Play,
  Pause,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadProductImage } from "@/lib/supabase/storage";
import type {
  UGCEthnicity,
  UGCSkinTone,
  UGCAgeRange,
  UGCHairStyle,
  UGCScene,
  UGCVibe,
  UGCLashStyle,
} from "@/lib/seedance/ugc-image-prompt";
import {
  UGC_ETHNICITY_OPTIONS,
  UGC_SKIN_TONE_OPTIONS,
  UGC_AGE_RANGE_OPTIONS,
  UGC_HAIR_STYLE_OPTIONS,
  UGC_SCENE_OPTIONS,
  UGC_VIBE_OPTIONS,
  UGC_LASH_STYLE_OPTIONS,
} from "@/lib/seedance/ugc-image-prompt";
import type { SeedanceAudioMode } from "@/lib/seedance/types";

interface SeedanceAvatarStepProps {
  initialPersonImageUrl?: string;
  onAvatarReady: (data: {
    personImageUrl: string;
    productImageUrl: string;
    audioMode: SeedanceAudioMode;
    audioUrl?: string;
    scene: UGCScene;
    vibe: UGCVibe;
    personDescription: string;
  }) => void;
}

interface GalleryImage {
  id: string;
  image_url: string;
  category: string;
  created_at: string;
}

interface ProductRefImage {
  id: string;
  image_url: string;
  category_name: string;
}

type PersonTab = "generate" | "gallery";
type ProductTab = "my-products" | "upload";

function pickRandom<T>(arr: readonly { value: T }[]): T {
  return arr[Math.floor(Math.random() * arr.length)].value;
}

export function SeedanceAvatarStep({
  initialPersonImageUrl,
  onAvatarReady,
}: SeedanceAvatarStepProps) {
  // Person image state
  const [personTab, setPersonTab] = useState<PersonTab>("generate");
  const [generatedPersonUrl, setGeneratedPersonUrl] = useState<string | null>(null);
  const [selectedGalleryUrl, setSelectedGalleryUrl] = useState<string | null>(
    initialPersonImageUrl ?? null
  );
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

  // UGC params
  const [ethnicity, setEthnicity] = useState<UGCEthnicity>("Latina");
  const [skinTone, setSkinTone] = useState<UGCSkinTone>("Medium");
  const [ageRange, setAgeRange] = useState<UGCAgeRange>("25-34");
  const [hairStyle, setHairStyle] = useState<UGCHairStyle>("Wavy");
  const [scene, setScene] = useState<UGCScene>("casual-bedroom");
  const [vibe, setVibe] = useState<UGCVibe>("excited-discovery");
  const [lashStyle, setLashStyle] = useState<UGCLashStyle>("Natural flutter");
  const [hasProduct, setHasProduct] = useState(false);
  const [productDesc, setProductDesc] = useState("");

  // Product image state
  const [productTab, setProductTab] = useState<ProductTab>("my-products");
  const [productImages, setProductImages] = useState<ProductRefImage[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio mode state
  const [audioMode, setAudioMode] = useState<SeedanceAudioMode>("script-in-prompt");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProductImages();
  }, []);

  useEffect(() => {
    if (personTab === "gallery" && galleryImages.length === 0) {
      fetchGalleryImages();
    }
  }, [personTab, galleryImages.length]);

  const fetchGalleryImages = async () => {
    setLoadingGallery(true);
    try {
      const res = await fetch("/api/images?limit=12&sortBy=created_at&sortOrder=desc");
      const data = await res.json();
      if (res.ok) setGalleryImages(data.images ?? []);
    } catch {
      /* non-fatal */
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
            all.push({ id: img.id, image_url: img.image_url, category_name: cat.name ?? "" });
          }
        }
        setProductImages(all);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleRandomize = () => {
    setEthnicity(pickRandom(UGC_ETHNICITY_OPTIONS));
    setSkinTone(pickRandom(UGC_SKIN_TONE_OPTIONS));
    setAgeRange(pickRandom(UGC_AGE_RANGE_OPTIONS));
    setHairStyle(pickRandom(UGC_HAIR_STYLE_OPTIONS));
    setScene(pickRandom(UGC_SCENE_OPTIONS));
    setVibe(pickRandom(UGC_VIBE_OPTIONS));
    setLashStyle(pickRandom(UGC_LASH_STYLE_OPTIONS));
    toast.success("Randomized all selections!");
  };

  const handleGenerateAvatar = async () => {
    setIsGeneratingAvatar(true);
    try {
      const res = await fetch("/api/seedance/generate-ugc-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ethnicity, skinTone, ageRange, hairStyle,
          scene, vibe, lashStyle, hasProduct,
          productDescription: hasProduct ? productDesc : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setGeneratedPersonUrl(data.imageUrl);
      toast.success("UGC avatar generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar generation failed");
    } finally {
      setIsGeneratingAvatar(false);
    }
  };

  const handleProductUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return; }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const result = await uploadProductImage(supabase, file, Date.now());
      setProductImageUrl(result.url);
      toast.success("Product image uploaded");
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) { toast.error("Please select an audio file"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Audio must be under 15MB"); return; }

    setIsUploadingAudio(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "mp3";
      const filename = `audio/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("brand-assets").upload(filename, file, {
        contentType: file.type,
        cacheControl: "3600",
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("brand-assets").getPublicUrl(filename);
      setAudioUrl(publicUrl);
      setAudioFile(file);
      toast.success("Audio uploaded");
    } catch {
      toast.error("Failed to upload audio");
    } finally {
      setIsUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlayingAudio(!isPlayingAudio);
  };

  const personImageUrl =
    personTab === "generate" ? generatedPersonUrl : selectedGalleryUrl;

  const personDescription = `${ageRange}-year-old ${ethnicity} woman with ${hairStyle.toLowerCase()} hair`;

  const canContinue =
    !!personImageUrl &&
    !!productImageUrl.trim() &&
    (audioMode === "script-in-prompt" || !!audioUrl);

  const handleContinue = () => {
    if (!canContinue) {
      toast.error("Please complete all selections");
      return;
    }
    onAvatarReady({
      personImageUrl: personImageUrl!,
      productImageUrl: productImageUrl.trim(),
      audioMode,
      audioUrl: audioMode === "uploaded-audio" ? audioUrl! : undefined,
      scene,
      vibe,
      personDescription,
    });
  };

  return (
    <div className="space-y-8">
      {/* ── Person Image ─────────────────────────────── */}
      <section className="space-y-3">
        <label className="text-sm font-semibold text-coco-brown">Person Image</label>

        <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
          <TabBtn active={personTab === "generate"} onClick={() => setPersonTab("generate")} icon={Sparkles} label="Generate UGC Avatar" />
          <TabBtn active={personTab === "gallery"} onClick={() => setPersonTab("gallery")} icon={ImageIcon} label="Select from Gallery" />
        </div>

        {personTab === "generate" && (
          <div className="space-y-4">
            {/* UGC param dropdowns — 2-column grid */}
            <div className="grid grid-cols-2 gap-3">
              <Dropdown label="Ethnicity" value={ethnicity} options={UGC_ETHNICITY_OPTIONS} onChange={(v) => setEthnicity(v as UGCEthnicity)} />
              <Dropdown label="Skin Tone" value={skinTone} options={UGC_SKIN_TONE_OPTIONS} onChange={(v) => setSkinTone(v as UGCSkinTone)} />
              <Dropdown label="Age Range" value={ageRange} options={UGC_AGE_RANGE_OPTIONS} onChange={(v) => setAgeRange(v as UGCAgeRange)} />
              <Dropdown label="Hair Style" value={hairStyle} options={UGC_HAIR_STYLE_OPTIONS} onChange={(v) => setHairStyle(v as UGCHairStyle)} />
              <Dropdown label="Scene" value={scene} options={UGC_SCENE_OPTIONS} onChange={(v) => setScene(v as UGCScene)} />
              <Dropdown label="Vibe" value={vibe} options={UGC_VIBE_OPTIONS} onChange={(v) => setVibe(v as UGCVibe)} />
            </div>
            <Dropdown label="Lash Style" value={lashStyle} options={UGC_LASH_STYLE_OPTIONS} onChange={(v) => setLashStyle(v as UGCLashStyle)} />

            {/* Product in image toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setHasProduct(!hasProduct)}
                className={cn(
                  "flex h-5 w-9 items-center rounded-full transition-colors",
                  hasProduct ? "bg-coco-golden" : "bg-coco-beige-dark"
                )}
              >
                <div className={cn("h-4 w-4 rounded-full bg-white shadow transition-transform", hasProduct ? "translate-x-4" : "translate-x-0.5")} />
              </button>
              <span className="text-xs text-coco-brown-medium">Show holding product in image</span>
            </div>
            {hasProduct && (
              <input
                type="text"
                value={productDesc}
                onChange={(e) => setProductDesc(e.target.value)}
                placeholder="e.g. a pink CocoLash box"
                className="w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none placeholder:text-coco-brown-medium/30 focus:border-coco-golden"
              />
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleGenerateAvatar}
                disabled={isGeneratingAvatar}
                className="flex-1 gap-2 bg-coco-brown py-5 text-sm font-semibold text-white shadow-md hover:bg-coco-brown-light disabled:opacity-50"
                size="lg"
              >
                {isGeneratingAvatar ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
                ) : (
                  <><Sparkles className="h-4 w-4" />Generate UGC Avatar</>
                )}
              </Button>
              <Button onClick={handleRandomize} variant="outline" size="lg" className="gap-2 py-5">
                <Shuffle className="h-4 w-4" />
                Randomize
              </Button>
            </div>

            {generatedPersonUrl && (
              <div className="overflow-hidden rounded-xl border-2 border-coco-golden/30">
                <div className="aspect-[9/16] max-h-80 bg-coco-beige-light">
                  <img src={generatedPersonUrl} alt="UGC Avatar" className="h-full w-full object-cover" />
                </div>
              </div>
            )}
          </div>
        )}

        {personTab === "gallery" && (
          <div>
            {loadingGallery ? (
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
                <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
                <span className="ml-2 text-xs text-coco-brown-medium/50">Loading images...</span>
              </div>
            ) : galleryImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
                <ImageIcon className="h-8 w-8 text-coco-brown-medium/30" />
                <p className="mt-2 text-xs text-coco-brown-medium/50">No images yet</p>
                <Link href="/generate" className="mt-3 flex items-center gap-1.5 rounded-lg bg-coco-golden px-4 py-2 text-xs font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5" />Go to Generate
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {galleryImages.map((img) => {
                  const isSelected = selectedGalleryUrl === img.image_url;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedGalleryUrl(img.image_url)}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                        isSelected ? "border-coco-golden ring-2 ring-coco-golden/30" : "border-transparent hover:border-coco-golden/40"
                      )}
                    >
                      <img src={img.image_url} alt="Generated" className="h-full w-full object-cover" />
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

      {/* ── Product Image ────────────────────────────── */}
      <section className="space-y-3">
        <label className="text-sm font-semibold text-coco-brown">Product Image</label>
        <p className="text-xs text-coco-brown-medium/60">Reference image for Seedance to include in the video</p>

        <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
          <TabBtn active={productTab === "my-products"} onClick={() => setProductTab("my-products")} icon={Package} label="My Products" />
          <TabBtn active={productTab === "upload"} onClick={() => setProductTab("upload")} icon={Upload} label="Upload" />
        </div>

        {productTab === "my-products" && (
          loadingProducts ? (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
              <Loader2 className="h-4 w-4 animate-spin text-coco-brown-medium/40" />
              <span className="ml-2 text-xs text-coco-brown-medium/50">Loading products...</span>
            </div>
          ) : productImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
              <Package className="h-6 w-6 text-coco-brown-medium/30" />
              <p className="mt-2 text-xs text-coco-brown-medium/50">No product images yet</p>
              <Link href="/settings" className="mt-2 flex items-center gap-1 text-[11px] font-medium text-coco-golden hover:text-coco-golden-dark">
                <Settings className="h-3 w-3" />Add in Settings
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
                    onClick={() => setProductImageUrl(img.image_url)}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                      isSelected ? "border-coco-golden ring-2 ring-coco-golden/30" : "border-transparent hover:border-coco-golden/40"
                    )}
                  >
                    <img src={img.image_url} alt={img.category_name} className="h-full w-full object-cover" />
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
          )
        )}

        {productTab === "upload" && (
          <div className="space-y-3">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleProductUpload} className="hidden" />
            {productImageUrl ? (
              <div className="space-y-2">
                <div className="relative aspect-square w-24 overflow-hidden rounded-lg border-2 border-coco-golden/30">
                  <img src={productImageUrl} alt="Product" className="h-full w-full object-cover" />
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="text-xs font-medium text-coco-golden hover:text-coco-golden-dark">Change image</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-coco-beige-dark bg-white p-8 transition-colors hover:border-coco-golden/40"
              >
                {isUploading ? (
                  <><Loader2 className="h-6 w-6 animate-spin text-coco-golden" /><span className="text-xs text-coco-brown-medium/50">Uploading...</span></>
                ) : (
                  <><Upload className="h-6 w-6 text-coco-brown-medium/30" /><span className="text-xs font-medium text-coco-brown-medium">Click to upload</span><span className="text-[10px] text-coco-brown-medium/40">PNG, JPG up to 10MB</span></>
                )}
              </button>
            )}
          </div>
        )}

        {/* URL paste */}
        <div>
          <button type="button" onClick={() => setShowUrlInput(!showUrlInput)} className="flex items-center gap-1 text-[11px] text-coco-brown-medium/40 hover:text-coco-brown-medium/60">
            <LinkIcon className="h-3 w-3" />Or paste a URL
            <ChevronDown className={cn("h-3 w-3 transition-transform", showUrlInput && "rotate-180")} />
          </button>
          {showUrlInput && (
            <input type="url" value={productImageUrl} onChange={(e) => setProductImageUrl(e.target.value)}
              placeholder="https://..." className="mt-2 w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none placeholder:text-coco-brown-medium/30 focus:border-coco-golden" />
          )}
        </div>
      </section>

      {/* ── Audio Mode ───────────────────────────────── */}
      <section className="space-y-3">
        <label className="text-sm font-semibold text-coco-brown">Audio Mode</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setAudioMode("script-in-prompt")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
              audioMode === "script-in-prompt"
                ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
            )}
          >
            <Mic className={cn("h-5 w-5", audioMode === "script-in-prompt" ? "text-coco-golden" : "text-coco-brown-medium")} />
            <span className={cn("text-xs font-semibold", audioMode === "script-in-prompt" ? "text-coco-brown" : "text-coco-brown-medium")}>AI Speaks the Script</span>
            <span className="text-[10px] text-coco-brown-medium/50">Seedance generates the voice</span>
          </button>
          <button
            type="button"
            onClick={() => setAudioMode("uploaded-audio")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
              audioMode === "uploaded-audio"
                ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
            )}
          >
            <Music className={cn("h-5 w-5", audioMode === "uploaded-audio" ? "text-coco-golden" : "text-coco-brown-medium")} />
            <span className={cn("text-xs font-semibold", audioMode === "uploaded-audio" ? "text-coco-brown" : "text-coco-brown-medium")}>Upload My Audio</span>
            <span className="text-[10px] text-coco-brown-medium/50">Lip-sync to your voice</span>
          </button>
        </div>

        {audioMode === "uploaded-audio" && (
          <div className="space-y-3">
            <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
            {audioUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-coco-golden/30 bg-white p-3">
                <button type="button" onClick={togglePlayAudio} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coco-golden text-white">
                  {isPlayingAudio ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-coco-brown">{audioFile?.name ?? "Uploaded audio"}</p>
                  <p className="text-[10px] text-coco-brown-medium/50">Ready for lip-sync</p>
                </div>
                <button type="button" onClick={() => { setAudioUrl(null); setAudioFile(null); }} className="text-coco-brown-medium/40 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
                <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlayingAudio(false)} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={isUploadingAudio}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-coco-beige-dark bg-white p-6 transition-colors hover:border-coco-golden/40"
              >
                {isUploadingAudio ? (
                  <><Loader2 className="h-5 w-5 animate-spin text-coco-golden" /><span className="text-xs text-coco-brown-medium/50">Uploading...</span></>
                ) : (
                  <><Upload className="h-5 w-5 text-coco-brown-medium/30" /><span className="text-xs font-medium text-coco-brown-medium">Upload audio file</span><span className="text-[10px] text-coco-brown-medium/40">MP3, WAV — max 15 seconds</span></>
                )}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Continue */}
      <Button
        onClick={handleContinue}
        disabled={!canContinue}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Generate →
      </Button>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-medium transition-all", active ? "bg-white text-coco-brown shadow-sm" : "text-coco-brown-medium/50 hover:text-coco-brown-medium")}>
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  );
}

function Dropdown({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-coco-brown-medium/60">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none focus:border-coco-golden"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
