/**
 * GET  /api/images — Paginated image listing with filters
 * DELETE /api/images — Delete an image by ID (DB record + Storage file)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";
import { deleteStorageFile, BUCKETS } from "@/lib/supabase/storage";
import type { ContentCategory, GeneratedImage } from "@/lib/types";

// ── GET: List images with filters ────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    // Filters
    const category = searchParams.get("category") as ContentCategory | null;
    const favorite = searchParams.get("favorite");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const sortBy = searchParams.get("sortBy") || "created_at";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? true : false;

    const userId = await getCurrentUserId(supabase);

    let query = supabase
      .from("generated_images")
      .select("*", { count: "exact" });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (category && ["lash-closeup", "lifestyle", "product", "before-after", "application-process"].includes(category)) {
      query = query.eq("category", category);
    }

    if (favorite === "true") {
      query = query.eq("is_favorite", true);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    // Apply sorting
    const validSortFields = ["created_at", "category", "generation_time_ms"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "created_at";
    query = query.order(sortField, { ascending: sortOrder });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error("Failed to fetch images:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch images." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      images: data as GeneratedImage[],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasMore: offset + limit < (count || 0),
      },
    });
  } catch (error) {
    console.error("Images GET error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove image by ID ───────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("id");

    if (!imageId) {
      return NextResponse.json(
        { error: "Image ID is required." },
        { status: 400 }
      );
    }

    const userId = await getCurrentUserId(supabase);

    let fetchQuery = supabase
      .from("generated_images")
      .select("id, storage_path, raw_image_url, image_url, user_id")
      .eq("id", imageId);

    if (userId) {
      fetchQuery = fetchQuery.eq("user_id", userId);
    }

    const { data: image, error: fetchError } = await fetchQuery.single();

    if (fetchError || !image) {
      return NextResponse.json(
        { error: "Image not found." },
        { status: 404 }
      );
    }

    // Delete from storage
    const deletionErrors: string[] = [];

    // Delete the main image (storage_path)
    if (image.storage_path) {
      try {
        await deleteStorageFile(supabase, BUCKETS.GENERATED_IMAGES, image.storage_path);
      } catch (e) {
        deletionErrors.push(`Main image: ${(e as Error).message}`);
      }
    }

    // If there's a raw image URL (meaning a logo overlay was applied),
    // the raw image has a different path. Extract it from the URL.
    if (image.raw_image_url && image.raw_image_url !== image.image_url) {
      try {
        // Extract path from URL: ...storage/v1/object/public/generated-images/BRAND_ID/UUID-raw.png
        const rawPathMatch = image.raw_image_url.match(
          /generated-images\/(.+?)(?:\?|$)/
        );
        if (rawPathMatch?.[1]) {
          await deleteStorageFile(
            supabase,
            BUCKETS.GENERATED_IMAGES,
            rawPathMatch[1]
          );
        }
      } catch (e) {
        deletionErrors.push(`Raw image: ${(e as Error).message}`);
      }
    }

    // Delete the database record
    const { error: deleteError } = await supabase
      .from("generated_images")
      .delete()
      .eq("id", imageId);

    if (deleteError) {
      console.error("Failed to delete image record:", deleteError.message);
      return NextResponse.json(
        { error: "Failed to delete image record." },
        { status: 500 }
      );
    }

    if (deletionErrors.length > 0) {
      console.warn("Storage deletion warnings:", deletionErrors);
    }

    return NextResponse.json({ success: true, id: imageId });
  } catch (error) {
    console.error("Images DELETE error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

// ── PATCH: Toggle favorite ───────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { id, is_favorite } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("generated_images")
      .update({ is_favorite: Boolean(is_favorite) })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update image:", error.message);
      return NextResponse.json(
        { error: "Failed to update image." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, image: data });
  } catch (error) {
    console.error("Images PATCH error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
