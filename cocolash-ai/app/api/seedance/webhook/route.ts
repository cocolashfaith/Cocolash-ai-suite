import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import type { SeedanceWebhookPayload } from "@/lib/seedance/types";
import type { GeneratedVideo } from "@/lib/types";

/**
 * POST /api/seedance/webhook
 *
 * Receives Enhancor Seedance completion/failure callbacks. Enhancor can send
 * duplicate callbacks, so request_id is treated as the idempotency key.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedWebhook(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json()) as SeedanceWebhookPayload;
    const requestId = payload.request_id ?? payload.requestId;

    if (!requestId) {
      return NextResponse.json(
        { error: "Missing request_id" },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient();
    const { data: video, error: fetchError } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("seedance_task_id", requestId)
      .eq("pipeline", "seedance")
      .maybeSingle();

    if (fetchError) {
      console.error("[seedance/webhook] DB fetch error:", fetchError);
      return NextResponse.json({ received: true, processed: false });
    }

    if (!video) {
      console.warn("[seedance/webhook] Unknown request_id:", requestId);
      return NextResponse.json({ received: true, processed: false });
    }

    const typedVideo = video as GeneratedVideo;
    const status = payload.status?.toUpperCase();

    if (status === "FAILED") {
      if (
        typedVideo.heygen_status !== "completed" &&
        typedVideo.heygen_status !== "captioning"
      ) {
        await supabase
          .from("generated_videos")
          .update({
            heygen_status: "failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", typedVideo.id);
      }

      return NextResponse.json({ received: true, processed: true });
    }

    if (status === "COMPLETED") {
      if (!payload.result) {
        await supabase
          .from("generated_videos")
          .update({
            heygen_status: "failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", typedVideo.id);

        return NextResponse.json({ received: true, processed: true });
      }

      await completeSeedanceVideo({
        supabase,
        video: typedVideo,
        rawVideoUrl: payload.result,
        thumbnailUrl: payload.thumbnail ?? null,
      });

      return NextResponse.json({ received: true, processed: true });
    }

    return NextResponse.json({ received: true, processed: false });
  } catch (error) {
    console.error("[seedance/webhook] Error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

function isAuthorizedWebhook(request: NextRequest): boolean {
  const secret = process.env.ENHANCOR_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[seedance/webhook] ENHANCOR_WEBHOOK_SECRET is not set");
    return false;
  }

  const incoming =
    request.headers.get("x-webhook-secret") ??
    request.nextUrl.searchParams.get("token") ??
    "";

  return safeCompare(incoming, secret);
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
