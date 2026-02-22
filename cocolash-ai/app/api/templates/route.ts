import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SavedPrompt } from "@/lib/types";

/**
 * GET /api/templates — List saved prompt templates
 * Sorted by use_count DESC (most-used first), then by created_at DESC.
 *
 * POST /api/templates — Save a new prompt template
 * Body: { name, selections, category, thumbnailUrl? }
 *
 * DELETE /api/templates?id=<uuid> — Delete a saved template
 *
 * PATCH /api/templates — Increment use_count on a template
 * Body: { id }
 */

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("saved_prompts")
      .select("*")
      .order("use_count", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch templates:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch templates." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      templates: (data || []) as SavedPrompt[],
      userId: user?.id || null,
    });
  } catch (error) {
    console.error("Templates GET error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { name, selections, category, thumbnailUrl } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Template name is required." },
        { status: 400 }
      );
    }

    if (!selections || typeof selections !== "object") {
      return NextResponse.json(
        { error: "Selections are required." },
        { status: 400 }
      );
    }

    if (!category || typeof category !== "string") {
      return NextResponse.json(
        { error: "Category is required." },
        { status: 400 }
      );
    }

    // Resolve user + brand
    const { data: { user } } = await supabase.auth.getUser();

    const { data: brand } = await supabase
      .from("brand_profiles")
      .select("id")
      .limit(1)
      .single();

    const record = {
      brand_id: brand?.id || null,
      user_id: user?.id || null,
      name: name.trim(),
      selections,
      category,
      thumbnail_url: thumbnailUrl || null,
      use_count: 0,
    };

    const { data, error } = await supabase
      .from("saved_prompts")
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error("Failed to save template:", error.message);
      return NextResponse.json(
        { error: "Failed to save template." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template: data as SavedPrompt,
    });
  } catch (error) {
    console.error("Templates POST error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Template ID is required." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("saved_prompts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete template:", error.message);
      return NextResponse.json(
        { error: "Failed to delete template." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Templates DELETE error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Template ID is required." },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("saved_prompts")
      .select("use_count")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found." },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("saved_prompts")
      .update({
        use_count: (existing.use_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Failed to increment use_count:", error.message);
      return NextResponse.json(
        { error: "Failed to update template." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Templates PATCH error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
