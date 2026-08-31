/**
 * POC ONLY — Seedance 2.5 (Enhancor) UGC demo endpoint. Not part of the shipped
 * product; hidden page at /poc/seedance25. Admin-guarded so it can't be used to
 * burn Enhancor credits. Safe to delete after the demo.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";

const ENHANCOR = "https://apireq.enhancor.ai/api/seedance2.5/v1";

export const POC_PRODUCT_URL =
  "https://cdn.shopify.com/s/files/1/0660/8646/9831/files/dahlia-915557.jpg?v=1768316695";
export const POC_INFLUENCER_URL =
  "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/generated-images/cocolash/1f59685f-4fad-4bd0-809d-98f89dd0d715-studio-avatar.jpg";

const PROMPT =
  "Handheld vertical UGC selfie video. A young woman with radiant skin and long, " +
  "fluttery lashes sits at a cozy, softly lit vanity. She smiles warmly at the camera, " +
  "holds up the CocoLash Dahlia lash kit so the packaging is clearly visible, then lightly " +
  "touches the outer corner of her eye to show off her lashes. Natural, candid, authentic " +
  "influencer energy, not overly polished. Soft natural daylight, shallow depth of field, " +
  "gentle handheld motion. She looks genuinely excited to share her favorite at-home lashes.";

const startSchema = z.object({
  resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
  duration: z.string().default("6"),
});

async function guard(): Promise<void> {
  const supabase = await createClient();
  await requireChatAdmin(supabase);
}

/** POST → queue a Seedance 2.5 UGC job. Returns { requestId, token }. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    await guard();
    const key = process.env.ENHANCOR_API_KEY;
    if (!key) return Response.json({ error: "no_api_key" }, { status: 500 });

    const parsed = startSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });

    // Public receiver for the completion callback.
    const tokRes = await fetch("https://webhook.site/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!tokRes.ok) return Response.json({ error: "webhook_setup_failed" }, { status: 502 });
    const tok = (await tokRes.json()) as { uuid: string };

    const body = {
      mode: "ugc",
      prompt: PROMPT,
      duration: parsed.data.duration,
      resolution: parsed.data.resolution,
      aspect_ratio: "9:16",
      webhook_url: `https://webhook.site/${tok.uuid}`,
      pass_faces: true,
      products: [POC_PRODUCT_URL],
      influencers: [POC_INFLUENCER_URL],
    };

    const res = await fetch(`${ENHANCOR}/queue`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return Response.json({ error: "enhancor_error", detail: text.slice(0, 300) }, { status: 502 });
    const j = JSON.parse(text);
    const requestId = j.requestId || j.request_id || j.id || j.data?.requestId;
    if (!requestId) return Response.json({ error: "no_request_id", detail: text.slice(0, 300) }, { status: 502 });

    return Response.json({ requestId, token: tok.uuid });
  } catch (err) {
    if (err instanceof ChatError) return Response.json({ error: err.code }, { status: err.status });
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

/** GET ?requestId=&token= → poll status. Returns { status, videoUrl?, cost? }. */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    await guard();
    const key = process.env.ENHANCOR_API_KEY;
    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get("requestId");
    const token = searchParams.get("token");
    if (!requestId || !token) return Response.json({ error: "missing_params" }, { status: 400 });

    // 1) Try Enhancor's own status endpoint (if it exists).
    if (key) {
      try {
        const sres = await fetch(`${ENHANCOR}/status`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key },
          body: JSON.stringify({ request_id: requestId }),
        });
        if (sres.ok) {
          const s = (await sres.json()) as Record<string, unknown>;
          const status = (s.status ?? (s.data as Record<string, unknown>)?.status) as string | undefined;
          const url = (s.result ?? s.video_url ?? (s.data as Record<string, unknown>)?.result) as string | undefined;
          if (status === "COMPLETED" && url) return Response.json({ status: "COMPLETED", videoUrl: url, cost: s.cost });
          if (status === "FAILED") return Response.json({ status: "FAILED", error: String(s.error ?? "failed") });
        }
      } catch {
        /* fall through to webhook */
      }
    }

    // 2) Poll the webhook receiver for the delivered callback.
    const wres = await fetch(`https://webhook.site/token/${token}/requests?sorting=newest`);
    if (wres.ok) {
      const wj = (await wres.json()) as { data?: Array<{ content?: string }> };
      for (const r of wj.data ?? []) {
        if (!r.content) continue;
        try {
          const p = JSON.parse(r.content) as Record<string, unknown>;
          const matches = !p.request_id || p.request_id === requestId || p.requestId === requestId;
          if (!matches) continue;
          if (p.status === "COMPLETED" && (p.result || p.video_url)) {
            return Response.json({ status: "COMPLETED", videoUrl: (p.result ?? p.video_url) as string, cost: p.cost });
          }
          if (p.status === "FAILED") return Response.json({ status: "FAILED", error: String(p.error ?? "failed") });
        } catch {
          /* ignore non-JSON deliveries */
        }
      }
    }

    return Response.json({ status: "RENDERING" });
  } catch (err) {
    if (err instanceof ChatError) return Response.json({ error: err.code }, { status: err.status });
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
