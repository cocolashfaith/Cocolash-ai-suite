/**
 * GET /api/publish/status?submissionId=<postSubmissionId>
 *
 * Blotato publishes asynchronously: POST /v2/posts returns a postSubmissionId,
 * and the live post URL only becomes available once the post finishes
 * publishing. This endpoint proxies Blotato's GET /v2/posts/{id} so the UI can
 * poll for the final `publicUrl` (the clickable link to the post) without
 * exposing the API key client-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBlotatoClient } from "@/lib/blotato/client";
import { BlotatoError } from "@/lib/blotato/types";

export async function GET(request: NextRequest) {
  try {
    const submissionId = request.nextUrl.searchParams.get("submissionId");
    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: settings } = await supabase
      .from("caption_settings")
      .select("blotato_api_key")
      .limit(1);

    const blotatoKey =
      settings?.[0]?.blotato_api_key || process.env.BLOTATO_API_KEY;

    if (!blotatoKey) {
      return NextResponse.json(
        { error: "Blotato API key not configured" },
        { status: 400 }
      );
    }

    const client = createBlotatoClient(blotatoKey);
    const result = await client.getPost(submissionId);

    return NextResponse.json({
      status: result.status,
      publicUrl: result.publicUrl ?? null,
      errorMessage: result.errorMessage ?? null,
    });
  } catch (error: unknown) {
    console.error("[publish/status] Error:", error);
    if (error instanceof BlotatoError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status >= 400 ? error.status : 500 }
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to fetch post status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
