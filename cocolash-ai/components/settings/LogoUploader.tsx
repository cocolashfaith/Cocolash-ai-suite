"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LOGO_VARIANTS } from "@/lib/constants/brand";
import { createClient } from "@/lib/supabase/client";
import { uploadBrandAsset } from "@/lib/supabase/storage";
import { Upload, Trash2, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface LogoUrls {
  logo_white_url: string | null;
  logo_dark_url: string | null;
  logo_gold_url: string | null;
}

interface LogoUploaderProps {
  logos: LogoUrls;
  onLogosUpdated: (logos: Partial<LogoUrls>) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];

export function LogoUploader({ logos, onLogosUpdated }: LogoUploaderProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getLogoUrl = (variant: string): string | null => {
    const key = `logo_${variant}_url` as keyof LogoUrls;
    return logos[key];
  };

  const handleUpload = async (
    variant: "white" | "dark" | "gold",
    file: File
  ) => {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    // Validate file type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Use PNG, SVG, JPEG, or WebP.");
      return;
    }

    setUploading(variant);

    try {
      const supabase = createClient();
      const { url } = await uploadBrandAsset(supabase, file, variant);

      // Update the brand profile with the new logo URL
      const updateKey = `logo_${variant}_url`;
      const response = await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [updateKey]: url }),
      });

      if (!response.ok) {
        throw new Error("Failed to update brand profile");
      }

      onLogosUpdated({ [updateKey]: url } as Partial<LogoUrls>);
      toast.success(
        `${variant.charAt(0).toUpperCase() + variant.slice(1)} logo uploaded successfully`
      );
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload logo. Please try again.");
    } finally {
      setUploading(null);
    }
  };

  const handleRemoveLogo = async (variant: "white" | "dark" | "gold") => {
    const updateKey = `logo_${variant}_url`;

    try {
      const response = await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [updateKey]: null }),
      });

      if (!response.ok) {
        throw new Error("Failed to update brand profile");
      }

      onLogosUpdated({ [updateKey]: null } as Partial<LogoUrls>);
      toast.success("Logo removed");
    } catch {
      toast.error("Failed to remove logo. Please try again.");
    }
  };

  const handleFileChange = (
    variant: "white" | "dark" | "gold",
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(variant, file);
    }
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  return (
    <Card className="border-coco-pink-dark/20 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-coco-brown">Brand Logos</CardTitle>
        <p className="text-sm text-coco-brown-medium">
          Upload logo variants for image overlays. PNG with transparency
          recommended. Max 5MB.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {LOGO_VARIANTS.map((variant) => {
            const logoUrl = getLogoUrl(variant.key);
            const isUploading = uploading === variant.key;
            // Background must contrast with the logo color:
            // Light Pink logo → dark brown background
            // Dark logo → white/light background
            // Beige logo → dark brown background
            const bgClass =
              variant.key === "white"
                ? "bg-coco-brown"
                : variant.key === "dark"
                  ? "bg-white border border-coco-beige-dark"
                  : "bg-coco-brown";

            return (
              <div
                key={variant.key}
                className="rounded-xl border border-coco-pink-dark/20 p-3"
              >
                {/* Label */}
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-coco-brown">
                      {variant.label}
                    </p>
                    <p className="text-[11px] text-coco-brown-medium">
                      {variant.description}
                    </p>
                  </div>
                  {logoUrl && (
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-[10px] text-green-700"
                    >
                      Uploaded
                    </Badge>
                  )}
                </div>

                {/* Preview / Upload area */}
                <div
                  className={`relative flex h-24 items-center justify-center rounded-lg ${bgClass}`}
                >
                  {logoUrl ? (
                    <Image
                      src={logoUrl}
                      alt={`${variant.label} preview`}
                      width={120}
                      height={48}
                      className="max-h-16 w-auto object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="flex flex-col items-center text-coco-beige/40">
                      <ImageIcon className="h-8 w-8" />
                      <span className="mt-1 text-[10px]">No logo</span>
                    </div>
                  )}

                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-2 flex gap-2">
                  <input
                    ref={(el) => {
                      fileInputRefs.current[variant.key] = el;
                    }}
                    type="file"
                    accept=".png,.svg,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) =>
                      handleFileChange(
                        variant.key as "white" | "dark" | "gold",
                        e
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 border-coco-pink-dark/30 text-xs text-coco-brown hover:bg-coco-pink/30"
                    onClick={() =>
                      fileInputRefs.current[variant.key]?.click()
                    }
                    disabled={isUploading}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    {logoUrl ? "Replace" : "Upload"}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() =>
                        handleRemoveLogo(
                          variant.key as "white" | "dark" | "gold"
                        )
                      }
                      disabled={isUploading}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
