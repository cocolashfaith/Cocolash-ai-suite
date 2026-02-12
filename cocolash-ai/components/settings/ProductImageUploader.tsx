"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { uploadProductImage } from "@/lib/supabase/storage";
import { Upload, Trash2, Loader2, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const MAX_PRODUCT_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface ProductImageUploaderProps {
  productImages: string[];
  onImagesUpdated: (urls: string[]) => void;
}

export function ProductImageUploader({
  productImages,
  onImagesUpdated,
}: ProductImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Use PNG, JPEG, or WebP.");
      return;
    }
    if (productImages.length >= MAX_PRODUCT_IMAGES) {
      toast.error(`Maximum ${MAX_PRODUCT_IMAGES} product images allowed.`);
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const { url } = await uploadProductImage(supabase, file, productImages.length);

      const updatedUrls = [...productImages, url];

      // Save to brand profile
      const response = await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_image_urls: updatedUrls }),
      });

      if (!response.ok) {
        throw new Error("Failed to update brand profile");
      }

      onImagesUpdated(updatedUrls);
      toast.success(`Product image uploaded (${updatedUrls.length}/${MAX_PRODUCT_IMAGES})`);
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload product image.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (index: number) => {
    setRemovingIndex(index);
    try {
      const updatedUrls = productImages.filter((_, i) => i !== index);

      const response = await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_image_urls: updatedUrls }),
      });

      if (!response.ok) {
        throw new Error("Failed to update brand profile");
      }

      onImagesUpdated(updatedUrls);
      toast.success("Product image removed");
    } catch {
      toast.error("Failed to remove product image.");
    } finally {
      setRemovingIndex(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    e.target.value = "";
  };

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
              Upload up to {MAX_PRODUCT_IMAGES} product photos. These are sent to
              the AI as reference when generating Product shots to ensure accurate
              product representation.
            </p>
          </div>
          <Badge
            variant="secondary"
            className="bg-coco-beige text-xs text-coco-brown-medium"
          >
            {productImages.length}/{MAX_PRODUCT_IMAGES}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Info banner */}
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800">
            For best results, upload clear, high-quality photos of your actual
            products from multiple angles. The AI will use these as strict
            references — the product shape, color, branding, and packaging will
            be preserved in generated images.
          </p>
        </div>

        {/* Image grid */}
        {productImages.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {productImages.map((url, index) => (
              <div
                key={url}
                className="group relative overflow-hidden rounded-xl border border-coco-pink-dark/20"
              >
                <div className="relative aspect-square">
                  <Image
                    src={url}
                    alt={`Product reference ${index + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {removingIndex === index && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => handleRemove(index)}
                    disabled={removingIndex !== null}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="absolute bottom-1 left-1">
                  <Badge className="bg-black/60 text-[10px] text-white">
                    #{index + 1}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed border-coco-pink-dark/30 text-sm text-coco-brown hover:bg-coco-pink/30"
          onClick={() => fileInputRef.current?.click()}
          disabled={
            uploading || productImages.length >= MAX_PRODUCT_IMAGES
          }
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : productImages.length >= MAX_PRODUCT_IMAGES ? (
            <>Maximum {MAX_PRODUCT_IMAGES} images reached</>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload Product Image ({productImages.length}/{MAX_PRODUCT_IMAGES})
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
