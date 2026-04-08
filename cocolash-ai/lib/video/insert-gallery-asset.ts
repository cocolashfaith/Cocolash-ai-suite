/**
 * Insert video-wizard assets (UGC avatars, HeyGen compositions) into generated_images.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AspectRatio,
  Composition,
  ContentCategory,
  GenerationSelections,
  LashStyle,
  VideoAspectRatio,
} from "@/lib/types";

export function videoAspectToImageAspect(
  ratio: VideoAspectRatio
): AspectRatio {
  return ratio as AspectRatio;
}

function defaultLogoOverlay(): GenerationSelections["logoOverlay"] {
  return {
    enabled: false,
    position: "bottom-right",
    variant: "white",
  };
}

export function buildMinimalSelectionsForVideoAsset(params: {
  aspectRatio: AspectRatio;
  lashStyle: LashStyle;
  heygenAsset: NonNullable<GenerationSelections["heygenAsset"]>;
}): GenerationSelections {
  return {
    category: "lifestyle",
    skinTone: "medium",
    lashStyle: params.lashStyle,
    hairStyle: "loose-waves",
    scene: "bedroom",
    composition: "solo" as Composition,
    aspectRatio: params.aspectRatio,
    resolution: "1K",
    vibe: "natural-beauty",
    logoOverlay: defaultLogoOverlay(),
    heygenAsset: params.heygenAsset,
  };
}

export async function getDefaultBrandId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase.from("brand_profiles").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function insertVideoGalleryAsset(params: {
  supabase: SupabaseClient;
  userId: string | null;
  brandId: string;
  imageUrl: string;
  storagePath: string;
  aspectRatio: AspectRatio;
  promptUsed: string;
  selections: GenerationSelections;
  tags: string[];
  geminiModel: string;
  generationTimeMs?: number;
}): Promise<{ id: string } | null> {
  const {
    supabase,
    userId,
    brandId,
    imageUrl,
    storagePath,
    aspectRatio,
    promptUsed,
    selections,
    tags,
    geminiModel,
    generationTimeMs,
  } = params;

  const record = {
    brand_id: brandId,
    user_id: userId,
    prompt_used: promptUsed,
    selections,
    image_url: imageUrl,
    raw_image_url: null,
    storage_path: storagePath,
    aspect_ratio: aspectRatio,
    category: selections.category as ContentCategory,
    composition: selections.composition,
    has_logo_overlay: false,
    logo_position: null,
    generation_time_ms: generationTimeMs ?? null,
    gemini_model: geminiModel,
    is_favorite: false,
    tags,
    seasonal_preset_id: null,
    group_count: 1,
    diversity_selections: null,
    is_composite: false,
  };

  const { data, error } = await supabase
    .from("generated_images")
    .insert(record)
    .select("id")
    .single();

  if (error) {
    console.error("[insertVideoGalleryAsset]", error);
    return null;
  }
  return data ? { id: data.id as string } : null;
}
