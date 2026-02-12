"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { uploadProductImage } from "@/lib/supabase/storage";
import {
  Upload,
  Trash2,
  Loader2,
  Package,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface ReferenceImage {
  id: string;
  category_id: string;
  image_url: string;
  storage_path: string;
  sort_order: number;
}

interface ProductCategoryData {
  id: string;
  key: string;
  label: string;
  description: string | null;
  images: ReferenceImage[];
  imageCount: number;
}

export function ProductCategoryManager() {
  const [categories, setCategories] = useState<ProductCategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingCatId, setUploadingCatId] = useState<string | null>(null);
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeCategoryRef = useRef<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/product-categories");
      const data = await res.json();
      if (data.categories) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error("Failed to fetch categories:", err);
      toast.error("Failed to load product categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // ── Upload handler ────────────────────────────────────────────
  const handleUpload = async (file: File, categoryId: string) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Use PNG, JPEG, or WebP.");
      return;
    }

    setUploadingCatId(categoryId);
    try {
      const supabase = createClient();
      const cat = categories.find((c) => c.id === categoryId);
      const index = cat ? cat.imageCount : 0;

      // Upload to Supabase Storage
      const { url, path } = await uploadProductImage(supabase, file, index);

      // Register in the database
      const res = await fetch(`/api/product-categories/${categoryId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: url, storage_path: path }),
      });

      if (!res.ok) {
        throw new Error("Failed to register image");
      }

      toast.success("Reference image uploaded");
      await fetchCategories(); // Refresh
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload reference image");
    } finally {
      setUploadingCatId(null);
    }
  };

  // ── Remove handler ────────────────────────────────────────────
  const handleRemove = async (categoryId: string, imageId: string) => {
    setRemovingImageId(imageId);
    try {
      const res = await fetch(
        `/api/product-categories/${categoryId}/images?imageId=${imageId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        throw new Error("Failed to delete image");
      }

      toast.success("Reference image removed");
      await fetchCategories(); // Refresh
    } catch {
      toast.error("Failed to remove reference image");
    } finally {
      setRemovingImageId(null);
    }
  };

  // ── File input handler ────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeCategoryRef.current) {
      handleUpload(file, activeCategoryRef.current);
    }
    e.target.value = "";
  };

  const triggerUpload = (categoryId: string) => {
    activeCategoryRef.current = categoryId;
    fileInputRef.current?.click();
  };

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="border-coco-pink-dark/20 bg-white">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-1 h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const totalImages = categories.reduce((sum, c) => sum + c.imageCount, 0);

  return (
    <Card className="border-coco-pink-dark/20 bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-coco-golden" />
          <div className="flex-1">
            <CardTitle className="text-lg text-coco-brown">
              Product Reference Images
            </CardTitle>
            <p className="text-sm text-coco-brown-medium">
              Upload reference photos for each product type. The AI uses these
              as strict references when generating product shots.
            </p>
          </div>
          <Badge
            variant="secondary"
            className="bg-coco-beige text-xs text-coco-brown-medium"
          >
            {totalImages} total
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Info banner */}
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800">
            Upload clear, high-quality photos of your actual products for each
            category. When generating, the AI will only receive images from the
            selected product type — ensuring accurate, focused results.
          </p>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Category accordion list */}
        <div className="space-y-2">
          {categories.map((cat) => {
            const isExpanded = expandedId === cat.id;
            const isUploading = uploadingCatId === cat.id;

            return (
              <div
                key={cat.id}
                className="overflow-hidden rounded-xl border border-coco-beige-dark/40 transition-colors hover:border-coco-golden/30"
              >
                {/* Category header — clickable to expand */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : cat.id)
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-coco-beige/30"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coco-beige text-coco-brown-medium">
                    <ImageIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-coco-brown truncate">
                      {cat.label}
                    </p>
                    <p className="text-[11px] text-coco-brown-medium/70 truncate">
                      {cat.description}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      cat.imageCount > 0
                        ? "bg-coco-golden/10 text-coco-golden text-xs"
                        : "bg-coco-beige text-coco-brown-medium/60 text-xs"
                    }
                  >
                    {cat.imageCount} image{cat.imageCount !== 1 ? "s" : ""}
                  </Badge>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-coco-brown-medium/50" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-coco-brown-medium/50" />
                  )}
                </button>

                {/* Expanded content — image grid + upload */}
                {isExpanded && (
                  <div className="border-t border-coco-beige-dark/30 bg-coco-beige/20 px-4 py-3">
                    {/* Image grid */}
                    {cat.images.length > 0 && (
                      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        {cat.images.map((img, idx) => (
                          <div
                            key={img.id}
                            className="group relative overflow-hidden rounded-lg border border-coco-pink-dark/20"
                          >
                            <div className="relative aspect-square">
                              <Image
                                src={img.image_url}
                                alt={`${cat.label} ref ${idx + 1}`}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                              {removingImageId === img.id && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                                </div>
                              )}
                            </div>
                            <div className="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="h-6 w-6 rounded-full"
                                onClick={() =>
                                  handleRemove(cat.id, img.id)
                                }
                                disabled={removingImageId !== null}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="absolute bottom-0.5 left-0.5">
                              <Badge className="bg-black/60 text-[9px] text-white px-1 py-0">
                                #{idx + 1}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Upload button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed border-coco-pink-dark/30 text-xs text-coco-brown hover:bg-coco-pink/30"
                      onClick={() => triggerUpload(cat.id)}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Add Reference Image
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
