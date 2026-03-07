"use client";

import { useState, useEffect, useCallback } from "react";
import { BrandProfileForm } from "@/components/settings/BrandProfileForm";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { ProductCategoryManager } from "@/components/settings/ProductCategoryManager";
import { HashtagManager } from "@/components/settings/HashtagManager";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrandProfile {
  id: string;
  name: string;
  color_palette: Record<string, unknown>;
  tone_keywords: string[];
  brand_dna_prompt: string;
  negative_prompt: string;
  skin_realism_prompt: string | null;
  logo_white_url: string | null;
  logo_dark_url: string | null;
  logo_gold_url: string | null;
  product_image_urls: string[];
  created_at: string;
  updated_at: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/brand");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load brand profile");
      }

      setProfile(data.profile);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load brand profile"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleProfileUpdated = (updated: BrandProfile) => {
    setProfile(updated);
  };

  const handleLogosUpdated = (
    logos: Partial<{
      logo_white_url: string | null;
      logo_dark_url: string | null;
      logo_gold_url: string | null;
    }>
  ) => {
    if (profile) {
      setProfile({ ...profile, ...logos });
    }
  };

  // Product images are now managed through ProductCategoryManager (separate tables)

  // ── Loading State ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-1 h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-coco-brown">
          Failed to Load Settings
        </h1>
        <p className="mt-2 text-sm text-coco-brown-medium">{error}</p>
        <Button
          onClick={fetchProfile}
          className="mt-4 bg-coco-golden text-white hover:bg-coco-golden-dark"
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (!profile) return null;

  // ── Main Settings Page ─────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coco-golden/10">
          <Settings className="h-5 w-5 text-coco-golden" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-coco-brown">
            Brand Settings
          </h1>
          <p className="text-sm text-coco-brown-medium">
            Manage your CocoLash brand profile, logos, and AI generation
            settings.
          </p>
        </div>
      </div>

      {/* Last updated info */}
      <p className="text-xs text-coco-brown-medium/60">
        Last updated:{" "}
        {new Date(profile.updated_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>

      {/* Logo Uploader */}
      <LogoUploader logos={profile} onLogosUpdated={handleLogosUpdated} />

      {/* Product Reference Images — Category-based */}
      <ProductCategoryManager />

      {/* Hashtag Database — Upgrade 1 */}
      <HashtagManager />

      {/* Brand Profile Form */}
      <BrandProfileForm
        profile={profile}
        onProfileUpdated={handleProfileUpdated}
      />
    </div>
  );
}
