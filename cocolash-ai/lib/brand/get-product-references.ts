/**
 * lib/brand/get-product-references.ts — Fetch product reference images from
 * the Supabase product_reference_images table by category ID.
 *
 * Used by the Seedance Director to inject reference media when a product's
 * ProductTruthEntry has a categoryId. Returns an empty array on error (graceful
 * degradation).
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
