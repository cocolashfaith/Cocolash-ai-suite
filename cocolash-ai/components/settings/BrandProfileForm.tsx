"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND_PALETTE } from "@/lib/constants/brand";
import { Loader2, Save, Plus, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { MASTER_BRAND_DNA } from "@/lib/prompts/brand-dna";
import { DEFAULT_NEGATIVE_PROMPT } from "@/lib/prompts/negative";
import { DEFAULT_SKIN_REALISM_PROMPT } from "@/lib/prompts/skin-realism";

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

interface BrandProfileFormProps {
  profile: BrandProfile;
  onProfileUpdated: (profile: BrandProfile) => void;
}

export function BrandProfileForm({
  profile,
  onProfileUpdated,
}: BrandProfileFormProps) {
  const [toneKeywords, setToneKeywords] = useState<string[]>(
    profile.tone_keywords || []
  );
  const [newKeyword, setNewKeyword] = useState("");
  const [brandDNA, setBrandDNA] = useState(profile.brand_dna_prompt || "");
  const [negativePrompt, setNegativePrompt] = useState(
    profile.negative_prompt || ""
  );
  const [skinRealismPrompt, setSkinRealismPrompt] = useState(
    profile.skin_realism_prompt || DEFAULT_SKIN_REALISM_PROMPT
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleAddKeyword = () => {
    const keyword = newKeyword.trim().toLowerCase();
    if (keyword && !toneKeywords.includes(keyword)) {
      setToneKeywords([...toneKeywords, keyword]);
      setNewKeyword("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setToneKeywords(toneKeywords.filter((k) => k !== keyword));
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone_keywords: toneKeywords,
          brand_dna_prompt: brandDNA,
          negative_prompt: negativePrompt,
          skin_realism_prompt: skinRealismPrompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Failed to save changes");
        return;
      }

      onProfileUpdated(data.profile);
      toast.success("Brand profile updated successfully");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDNA = () => {
    setBrandDNA(MASTER_BRAND_DNA);
    toast.info("Brand DNA reset to default");
  };

  const handleResetSkinRealism = () => {
    setSkinRealismPrompt(DEFAULT_SKIN_REALISM_PROMPT);
    toast.info("Skin realism prompt reset to default");
  };

  const handleResetNegative = () => {
    setNegativePrompt(DEFAULT_NEGATIVE_PROMPT);
    toast.info("Negative prompt reset to default");
  };

  return (
    <div className="space-y-6">
      {/* ── Color Palette (Read-Only) ──────────────────────── */}
      <Card className="border-coco-pink-dark/20 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-coco-brown">
            Color Palette
          </CardTitle>
          <p className="text-sm text-coco-brown-medium">
            60-30-10 Rule: Primary, Secondary, and Accent colors. These are
            hardcoded into the brand identity.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {BRAND_PALETTE.map((color) => (
              <div key={color.hex} className="text-center">
                <div
                  className="mx-auto h-14 w-14 rounded-xl shadow-sm ring-1 ring-coco-pink-dark/20"
                  style={{ backgroundColor: color.hex }}
                />
                <p className="mt-1.5 text-xs font-medium text-coco-brown">
                  {color.label}
                </p>
                <p className="text-[10px] text-coco-brown-medium">
                  {color.hex}
                </p>
                <Badge
                  variant="secondary"
                  className="mt-1 bg-coco-beige text-[9px] text-coco-brown-medium"
                >
                  {color.category}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Style Keywords ─────────────────────────────────── */}
      <Card className="border-coco-pink-dark/20 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-coco-brown">
            Style Keywords
          </CardTitle>
          <p className="text-sm text-coco-brown-medium">
            Keywords that define the brand tone. Used in every image generation
            prompt.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {toneKeywords.map((keyword) => (
              <Badge
                key={keyword}
                variant="secondary"
                className="gap-1 bg-coco-pink/50 text-coco-brown hover:bg-coco-pink"
              >
                {keyword}
                <button
                  onClick={() => handleRemoveKeyword(keyword)}
                  className="ml-1 rounded-full p-0.5 hover:bg-coco-brown/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Add a keyword..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              className="max-w-xs border-coco-pink-dark/30 bg-white text-coco-brown placeholder:text-coco-brown-medium/40"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddKeyword}
              disabled={!newKeyword.trim()}
              className="border-coco-pink-dark/30 text-coco-brown hover:bg-coco-pink/30"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Brand DNA Prompt ───────────────────────────────── */}
      <Card className="border-coco-pink-dark/20 bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-coco-brown">
                Brand DNA Prompt
              </CardTitle>
              <p className="text-sm text-coco-brown-medium">
                Master system context prepended to every AI image generation
                call. Edit carefully.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetDNA}
              className="text-xs text-coco-brown-medium hover:bg-coco-pink/30 hover:text-coco-brown"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <textarea
            value={brandDNA}
            onChange={(e) => setBrandDNA(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-coco-pink-dark/30 bg-coco-beige-light p-3 font-mono text-xs text-coco-brown placeholder:text-coco-brown-medium/40 focus:outline-none focus:ring-2 focus:ring-coco-golden/50"
            placeholder="Enter brand DNA system prompt..."
          />
          <p className="mt-1 text-xs text-coco-brown-medium/60">
            {brandDNA.length} characters
          </p>
        </CardContent>
      </Card>

      {/* ── Skin Realism Prompt ────────────────────────────── */}
      <Card className="border-coco-pink-dark/20 bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-coco-brown">
                Skin Realism Prompt
              </CardTitle>
              <p className="text-sm text-coco-brown-medium">
                Injected into Lifestyle and Close-Up generations for hyper-realistic skin rendering. Skipped for Product shots.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetSkinRealism}
              className="text-xs text-coco-brown-medium hover:bg-coco-pink/30 hover:text-coco-brown"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <textarea
            value={skinRealismPrompt}
            onChange={(e) => setSkinRealismPrompt(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-coco-pink-dark/30 bg-coco-beige-light p-3 font-mono text-xs text-coco-brown placeholder:text-coco-brown-medium/40 focus:outline-none focus:ring-2 focus:ring-coco-golden/50"
            placeholder="Enter skin realism directives..."
          />
          <p className="mt-1 text-xs text-coco-brown-medium/60">
            {skinRealismPrompt.length} characters
          </p>
        </CardContent>
      </Card>

      {/* ── Negative Prompt ────────────────────────────────── */}
      <Card className="border-coco-pink-dark/20 bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-coco-brown">
                Negative Prompt
              </CardTitle>
              <p className="text-sm text-coco-brown-medium">
                Styles and elements to explicitly exclude from generated images.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetNegative}
              className="text-xs text-coco-brown-medium hover:bg-coco-pink/30 hover:text-coco-brown"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-coco-pink-dark/30 bg-coco-beige-light p-3 font-mono text-xs text-coco-brown placeholder:text-coco-brown-medium/40 focus:outline-none focus:ring-2 focus:ring-coco-golden/50"
            placeholder="Enter terms to exclude..."
          />
          <p className="mt-1 text-xs text-coco-brown-medium/60">
            {negativePrompt.length} characters
          </p>
        </CardContent>
      </Card>

      <Separator className="bg-coco-pink-dark/15" />

      {/* ── Save Button ────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-coco-golden font-semibold text-white shadow-md hover:bg-coco-golden-dark"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
