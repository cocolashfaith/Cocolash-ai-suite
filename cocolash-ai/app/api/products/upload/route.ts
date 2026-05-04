/**
 * POST /api/products/upload
 *
 * Universal product-image upload endpoint used by the v4 Seedance wizard's
 * product pickers (UGC mode and any other mode that needs a product
 * reference). Pipeline:
 *
 *   1. Receive a multipart/form-data file
 *   2. Upload to brand-assets / products/<random>.ext
 *   3. Look up (or auto-create) a "Custom" product category
 *   4. Insert a product_reference_images row so the upload appears in
 *      the picker on next visit
 *   5. Return { id, image_url, category_name } so the caller can mark
 *      the new image as selected without a re-fetch
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { uploadProductImage } from "@/lib/supabase/storage";

const CUSTOM_CATEGORY_NAME = "Custom Uploads";
const CUSTOM_CATEGORY_SLUG = "custom-uploads";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Multipart 'file' field is required" },
        { status: 400 }
      );
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image must be under 10 MB" },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient();

    // Upload to brand-assets/products/...
    const { url: imageUrl, path: storagePath } = await uploadProductImage(
      supabase,
      file,
      Date.now()
    );

    // Resolve (or create) the Custom Uploads category
    let categoryId: string | null = null;
    let categoryName = CUSTOM_CATEGORY_NAME;

    const { data: existingCat } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("slug", CUSTOM_CATEGORY_SLUG)
      .maybeSingle();

    if (existingCat) {
      categoryId = existingCat.id;
      categoryName = existingCat.name;
    } else {
      // Auto-create. The schema may not have a slug column on every
      // deployment; fall back to name-only insert if slug isn't accepted.
      const { data: created, error: createErr } = await supabase
        .from("product_categories")
        .insert({
          name: CUSTOM_CATEGORY_NAME,
          slug: CUSTOM_CATEGORY_SLUG,
          sort_order: 999,
        })
        .select("id, name")
        .single();
      if (createErr) {
        // Older schemas: try without slug
        const { data: created2 } = await supabase
          .from("product_categories")
          .insert({ name: CUSTOM_CATEGORY_NAME, sort_order: 999 })
          .select("id, name")
          .single();
        if (created2) {
          categoryId = created2.id;
          categoryName = created2.name;
        }
      } else if (created) {
        categoryId = created.id;
        categoryName = created.name;
      }
    }

    if (!categoryId) {
      // Last-resort fallback: still return the uploaded URL so the user can
      // use it RIGHT NOW even if the DB row failed. It just won't be in the
      // picker on next visit.
      console.error(
        "[products/upload] Could not resolve/create Custom Uploads category — returning uploaded URL only"
      );
      return NextResponse.json({
        success: true,
        image: {
          id: `temp-${Date.now()}`,
          image_url: imageUrl,
          storage_path: storagePath,
          category_name: categoryName,
        },
        warning:
          "Image uploaded but not saved to the product library. Try re-uploading later.",
      });
    }

    // Persist as a product_reference_images row
    const { data: existing } = await supabase
      .from("product_reference_images")
      .select("sort_order")
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder =
      existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const { data: inserted, error: insertError } = await supabase
      .from("product_reference_images")
      .insert({
        category_id: categoryId,
        image_url: imageUrl,
        storage_path: storagePath,
        sort_order: nextSortOrder,
      })
      .select("id, image_url, storage_path")
      .single();

    if (insertError || !inserted) {
      console.error("[products/upload] DB insert failed:", insertError);
      // Fall back to returning the URL so the user isn't blocked
      return NextResponse.json({
        success: true,
        image: {
          id: `temp-${Date.now()}`,
          image_url: imageUrl,
          storage_path: storagePath,
          category_name: categoryName,
        },
        warning:
          "Image uploaded but not saved to the product library — it won't appear next visit.",
      });
    }

    return NextResponse.json({
      success: true,
      image: {
        id: inserted.id,
        image_url: inserted.image_url,
        storage_path: inserted.storage_path,
        category_name: categoryName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("[products/upload] error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
