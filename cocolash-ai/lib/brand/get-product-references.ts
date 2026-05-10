/**
 * lib/brand/get-product-references.ts — Fetch product reference images from
 * the Supabase product_reference_images table.
 *
 * Two lookup paths:
 *   - getProductReferenceImagesByCategory(supabase, categoryId)
 *       Direct UUID lookup. Used when ProductTruthEntry.categoryId is set.
 *   - getProductReferenceImagesByCategoryKey(supabase, key)
 *       Slug → UUID resolution against product_categories.key, then images.
 *       Preferred path for ProductTruthEntry.categoryKey because it survives
 *       env / DB rebuilds (UUIDs change; slugs do not).
 *
 * Both return [] on error (graceful degradation). The Director already handles
 * an empty array by skipping the reference-images block in composeUserMessage.
 */

import { type SupabaseClient } from "@supabase/supabase-js";

export async function getProductReferenceImagesByCategory(
  supabase: SupabaseClient,
  categoryId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_reference_images")
    .select("image_url")
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: true });

  if (error) return [];
  return (data ?? []).map((row) => row.image_url as string);
}

/**
 * Resolve a stable category key (e.g. "single-black-tray") to its row in
 * product_categories, then fetch the reference images attached to that row.
 *
 * Returns [] if the key does not match any category, or on any DB error.
 */
export async function getProductReferenceImagesByCategoryKey(
  supabase: SupabaseClient,
  key: string
): Promise<string[]> {
  const { data: category, error: catError } = await supabase
    .from("product_categories")
    .select("id")
    .eq("key", key)
    .maybeSingle();

  if (catError || !category?.id) return [];
  return getProductReferenceImagesByCategory(supabase, category.id as string);
}
