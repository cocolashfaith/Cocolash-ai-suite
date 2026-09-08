import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import {
  findSeedanceVideoByTaskId,
  safeUpdateVideo,
  truncateErrorMessage,
} from "@/lib/seedance/v25/db";
import { parseSeedance25Callback } from "@/lib/seedance/v25/schema";
import { rowHasSeedance25Columns } from "@/lib/supabase/schema-errors";
import type { SeedanceEngine } from "@/lib/types";

/**
 * POST /api/seedance/webhook — the ONE public callback route for BOTH engines
 * (03-PLAN.md §1.3). Already in the middleware public allow-list; the shared
 * secret arrives as `?token=` (Enhancor cannot set custom headers) or
 * `x-webhook-secret`.
 *
 * `parseSeedance25Callback` handles the 2.0 payload shape too — 2.0 simply has
 * no `cost`. Enhancor delivers callbacks MORE THAN ONCE for the same
 * `request_id`, so everything here is idempotent:
 *   - COMPLETED goes through `completeSeedanceVideo`, whose atomic claim
 *     (`UPDATE … WHERE heygen_status IN (pending, processing, captioning)`)
 *     means only the first delivery does any work;
 *   - FAILED skips rows already completed/captioning.
 *
 * This route NEVER retries anything and NEVER calls /queue.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedWebhook(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await request.json().catch(() => null);
    const result = parseSeedance25Callback(raw);

    if (!result) {
      return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
    }

    const supabase = await createAdminClient();
    const video = await findSeedanceVideoByTaskId(supabase, result.requestId);

    if (!video) {
      console.warn("[seedance/webhook] Unknown request_id:", result.requestId);
      return NextResponse.json({ received: true, processed: false });
    }

    const engine: SeedanceEngine = video.engine ?? "2.0";
    // `error_message` only exists after the 20260908 migration. A row read with
    // select("*") tells us whether it landed — never write it blindly.
    const canWriteErrorMessage = rowHasSeedance25Columns(
      video as unknown as Record<string, unknown>
    );

    if (result.status === "FAILED") {
      if (video.heygen_status !== "completed" && video.heygen_status !== "captioning") {
        await safeUpdateVideo(supabase, video.id, {
          heygen_status: "failed",
          completed_at: new Date().toISOString(),
          ...(canWriteErrorMessage
            ? {
                error_message: truncateErrorMessage(
                  result.error ?? "Enhancor reported FAILED without a reason"
                ),
              }
            : {}),
        });
      }

      return NextResponse.json({ received: true, processed: true });
    }

    if (result.status === "COMPLETED") {
      if (!result.resultUrl) {
        if (video.heygen_status !== "completed" && video.heygen_status !== "captioning") {
          await safeUpdateVideo(supabase, video.id, {
            heygen_status: "failed",
            completed_at: new Date().toISOString(),
            ...(canWriteErrorMessage
              ? { error_message: "Enhancor completed without a video URL" }
              : {}),
          });
        }

        return NextResponse.json({ received: true, processed: true });
      }

      await completeSeedanceVideo({
        supabase,
        video,
        rawVideoUrl: result.resultUrl,
        thumbnailUrl: result.thumbnailUrl ?? null,
        creditsCost: result.cost ?? null,
        engine,
      });

      return NextResponse.json({ received: true, processed: true });
    }

    return NextResponse.json({ received: true, processed: false });
  } catch (error) {
    console.error("[seedance/webhook] Error:", error);
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
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
