/**
 * Diversity Rotation Tracker
 *
 * Queries the diversity_tracker table to find recently used
 * skin tones and hair styles, enabling the "random" selections
 * to rotate through underrepresented combinations.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import type { SkinTone, HairStyle, Ethnicity } from "@/lib/types";

/** Number of recent records to consider for rotation. */
const RECENT_WINDOW = 20;

/**
 * Fetches recent diversity usage for a brand to inform random selection.
 */
export async function getRecentDiversityUsage(
  supabase: SupabaseClient,
  brandId: string
): Promise<{
  recentSkinTones: Exclude<SkinTone, "random">[];
  recentHairStyles: Exclude<HairStyle, "random">[];
}> {
  const { data, error } = await supabase
    .from("diversity_tracker")
    .select("skin_tone, hair_style")
    .eq("brand_id", brandId)
    .order("used_at", { ascending: false })
    .limit(RECENT_WINDOW);

  if (error || !data) {
    console.warn("Failed to fetch diversity data:", error?.message);
    return { recentSkinTones: [], recentHairStyles: [] };
  }

  return {
    recentSkinTones: data.map((d) => d.skin_tone as Exclude<SkinTone, "random">),
    recentHairStyles: data.map((d) => d.hair_style as Exclude<HairStyle, "random">),
  };
}

/**
 * Records a diversity selection after image generation.
 */
export async function recordDiversitySelection(
  supabase: SupabaseClient,
  brandId: string,
  skinTone: Exclude<SkinTone, "random">,
  hairStyle: Exclude<HairStyle, "random">,
  ageRange?: string,
  ethnicity?: Exclude<Ethnicity, "random">
): Promise<void> {
  const { error } = await supabase.from("diversity_tracker").insert({
    brand_id: brandId,
    skin_tone: skinTone,
    hair_style: hairStyle,
    age_range: ageRange || null,
    ethnicity: ethnicity || null,
  });

  if (error) {
    console.warn("Failed to record diversity selection:", error.message);
  }
}
