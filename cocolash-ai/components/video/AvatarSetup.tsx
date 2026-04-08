"use client";

import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadProductImage } from "@/lib/supabase/storage";
import type { CompositionPose } from "@/lib/types";

interface AvatarSetupProps {
  initialPersonImageUrl?: string;
  initialPersonImageId?: string;
  onCompositionReady: (data: {
    personImageUrl: string;
    personImageId?: string;
    productImageUrl: string;
    composedImageUrl: string;
    pose: CompositionPose;
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

const POSES: {
  value: CompositionPose;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "holding", label: "Holding", description: "Product at chest level", icon: Hand },
  { value: "applying", label: "Applying", description: "Application tutorial", icon: Brush },
  { value: "selfie", label: "Selfie", description: "Social media style", icon: Camera },
  { value: "testimonial", label: "Testimonial", description: "Review/talk to camera", icon: MessageCircle },
];

type ProductTab = "my-products" | "upload" | "url";

export function AvatarSetup({
  initialPersonImageUrl,
  initialPersonImageId,
  onCompositionReady,
}: AvatarSetupProps) {
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
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

  // Product picker state
  const [productTab, setProductTab] = useState<ProductTab>("my-products");
  const [productImages, setProductImages] = useState<ProductRefImage[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchGalleryImages();
    fetchProductImages();
  }, []);

  const fetchGalleryImages = async () => {
    setLoadingGallery(true);
    try {
      const res = await fetch("/api/images?limit=12&sortBy=created_at&sortOrder=desc");
      const data = await res.json();
      if (res.ok) {
        setGalleryImages(data.images ?? []);
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

  const handleSelectPerson = (img: GalleryImage) => {
    setSelectedPersonId(img.id);
    setSelectedPersonUrl(img.image_url);
    setComposedImageUrl(null);
  };

  const handleSelectProduct = (url: string) => {
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
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.composedImageUrl) {
        throw new Error(data.error ?? "Composition failed");
      }

      setComposedImageUrl(data.composedImageUrl);
      toast.success("Composition created!");
    } catch (err) {
      console.error("Composition error:", err);
      toast.error(
        err instanceof Error ? err.message : "Composition failed — please try again."
      );
    } finally {
      setIsComposing(false);
    }
  };

  const handleContinue = () => {
    if (!selectedPersonUrl || !productImageUrl.trim()) {
      toast.error("Please complete all selections");
      return;
    }

    onCompositionReady({
      personImageUrl: selectedPersonUrl,
      personImageId: selectedPersonId ?? undefined,
      productImageUrl: productImageUrl.trim(),
      composedImageUrl: composedImageUrl ?? selectedPersonUrl,
      pose,
    });
  };

  const hasInitialImage = !!initialPersonImageUrl;

  return (
    <div className="space-y-6">
      {/* Person Image Selection */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Person Image
        </label>
        <p className="text-xs text-coco-brown-medium/60">
          Choose a generated image to use as the avatar face
        </p>

        {loadingGallery ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
            <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
            <span className="ml-2 text-xs text-coco-brown-medium/50">Loading images...</span>
          </div>
        ) : galleryImages.length === 0 && !hasInitialImage ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
            <ImageIcon className="h-8 w-8 text-coco-brown-medium/30" />
            <p className="mt-2 text-xs text-coco-brown-medium/50">
              No images yet — generate some first
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
            {/* Show initial image first if it's not already in gallery */}
            {hasInitialImage &&
              !galleryImages.some((g) => g.id === initialPersonImageId) && (
                <button
                  type="button"
                  onClick={() => {
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

            {galleryImages.map((img) => {
              const isSelected = selectedPersonId === img.id;
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

      {/* Product Image — Tabbed Picker */}
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

      {/* Pose Selector */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Composition Pose
        </label>
        <div className="grid grid-cols-2 gap-3">
          {POSES.map((p) => {
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
