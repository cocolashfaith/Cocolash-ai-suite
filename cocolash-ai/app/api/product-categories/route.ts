/**
 * GET /api/product-categories — List all product categories with image counts
 *
 * Returns the 8 product sub-categories, each with its reference images.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all categories ordered by sort_order
    const { data: categories, error: catError } = await supabase
      .from("product_categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (catError) {
      console.error("Failed to fetch product categories:", catError.message);
      return NextResponse.json(
        { error: "Failed to load product categories" },
        { status: 500 }
      );
    }

    // Fetch all reference images
    const { data: images, error: imgError } = await supabase
      .from("product_reference_images")
      .select("*")
      .order("sort_order", { ascending: true });

    if (imgError) {
      console.error("Failed to fetch reference images:", imgError.message);
      return NextResponse.json(
        { error: "Failed to load reference images" },
        { status: 500 }
      );
    }

    // Group images by category_id
    const imagesByCategory: Record<string, typeof images> = {};
    for (const img of images || []) {
      if (!imagesByCategory[img.category_id]) {
        imagesByCategory[img.category_id] = [];
      }
      imagesByCategory[img.category_id].push(img);
    }

    // Attach images to each category
    const enrichedCategories = (categories || []).map((cat) => ({
      ...cat,
      images: imagesByCategory[cat.id] || [],
      imageCount: (imagesByCategory[cat.id] || []).length,
    }));

    return NextResponse.json({ categories: enrichedCategories });
  } catch (error) {
    console.error("Product categories error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
