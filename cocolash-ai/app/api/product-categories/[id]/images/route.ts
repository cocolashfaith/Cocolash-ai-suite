/**
 * POST /api/product-categories/[id]/images — Upload a reference image
 * DELETE /api/product-categories/[id]/images — Remove a reference image
 *
 * Manages reference images for a specific product sub-category.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── POST: Add image URL to a category ─────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoryId } = await params;
    const body = await request.json();
    const { image_url, storage_path } = body;

    if (!image_url || !storage_path) {
      return NextResponse.json(
        { error: "image_url and storage_path are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify category exists
    const { data: category, error: catError } = await supabase
      .from("product_categories")
      .select("id")
      .eq("id", categoryId)
      .single();

    if (catError || !category) {
      return NextResponse.json(
        { error: "Product category not found" },
        { status: 404 }
      );
    }

    // Get current max sort_order for this category
    const { data: existing } = await supabase
      .from("product_reference_images")
      .select("sort_order")
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder = existing && existing.length > 0
      ? existing[0].sort_order + 1
      : 0;

    // Insert the reference image
    const { data: inserted, error: insertError } = await supabase
      .from("product_reference_images")
      .insert({
        category_id: categoryId,
        image_url,
        storage_path,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert reference image:", insertError.message);
      return NextResponse.json(
        { error: "Failed to save reference image" },
        { status: 500 }
      );
    }

    return NextResponse.json({ image: inserted }, { status: 201 });
  } catch (error) {
    console.error("Add reference image error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove a reference image ──────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoryId } = await params;
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");

    if (!imageId) {
      return NextResponse.json(
        { error: "imageId query parameter is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the image to find storage path
    const { data: image, error: fetchError } = await supabase
      .from("product_reference_images")
      .select("*")
      .eq("id", imageId)
      .eq("category_id", categoryId)
      .single();

    if (fetchError || !image) {
      return NextResponse.json(
        { error: "Reference image not found" },
        { status: 404 }
      );
    }

    // Delete from storage
    if (image.storage_path) {
      const { error: storageError } = await supabase.storage
        .from("brand-assets")
        .remove([image.storage_path]);

      if (storageError) {
        console.warn("Failed to delete from storage:", storageError.message);
        // Continue anyway — the DB record should still be removed
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from("product_reference_images")
      .delete()
      .eq("id", imageId);

    if (deleteError) {
      console.error("Failed to delete reference image:", deleteError.message);
      return NextResponse.json(
        { error: "Failed to delete reference image" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete reference image error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
