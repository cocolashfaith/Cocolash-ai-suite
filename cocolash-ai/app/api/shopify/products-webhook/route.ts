/**
 * POST /api/shopify/products-webhook — nightly Shopify product sync.
 *
 * Subscribed Shopify topics (configured in the admin):
 *   products/create
 *   products/update
 *   products/delete
 *
 * Verifies HMAC via X-Shopify-Hmac-Sha256 (no URL-token fallback —
 * intentionally fixes the pattern flagged in CONCERNS.md). Upserts changed
 * products into knowledge_chunks at tier 3 (storefront_api) and removes
 * deleted products. Idempotent: a re-delivery with the same content is a
 * no-op via content_hash.
 *
 * Note: middleware.ts must list this route in publicPaths (handled in a
 * follow-up commit so existing /api/seedance/webhook semantics aren't
 * disturbed).
 */

import { NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { verifyShopifyHmac } from "@/lib/shopify/hmac";
import { contentHash } from "@/lib/chat/embeddings";
import { embed } from "@/lib/chat/embeddings";
import { upsertChunk, deleteChunkBySource } from "@/lib/chat/db";
import { EMBEDDING_MODEL } from "@/lib/chat/embeddings";
import { isExcludedFromKb } from "@/lib/shopify/kb-exclusions";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ShopifyProductPayload {
  id: number;
  handle: string;
  title: string;
  body_html?: string;
  product_type?: string;
  tags?: string;
  vendor?: string;
  status?: "active" | "archived" | "draft";
  variants?: Array<{
    id: number;
    title: string;
    price: string;
    inventory_quantity?: number;
  }>;
  options?: Array<{ name: string; values: string[] }>;
}

function topic(req: NextRequest): string {
  return req.headers.get("x-shopify-topic")?.toLowerCase() ?? "";
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase config missing");
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const verify = verifyShopifyHmac({
    rawBody,
    headers: req.headers,
    secret: process.env.SHOPIFY_WEBHOOK_SECRET,
  });
  if (!verify.ok) {
    return new Response(
      JSON.stringify({ error: "unauthorized", reason: verify.reason }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  let payload: ShopifyProductPayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyProductPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = getServiceSupabase();
  const sourceId = `storefront:${payload.handle}`;
  const t = topic(req);

  if (t === "products/delete") {
    await deleteChunkBySource(supabase, "storefront_api", sourceId).catch(() => undefined);
    return new Response(JSON.stringify({ received: true, action: "deleted" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // Products the store hides / restricts (hidden, existing-customers-only, the
  // Bond + Sealant refill) or that aren't `active` must never enter the KB. If
  // such a product is created/updated, remove any chunk it previously had and
  // stop — this is what keeps Coco in sync when a product is hidden in Shopify.
  if (isExcludedFromKb({ handle: payload.handle, tags: payload.tags, status: payload.status })) {
    await deleteChunkBySource(supabase, "storefront_api", sourceId).catch(() => undefined);
    return new Response(JSON.stringify({ received: true, action: "excluded" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // create / update. Prices are intentionally NOT stored — Coco quotes price
  // ONLY from the live Shopify product card for the turn, so a price change is
  // reflected instantly and the bot can never recite a stale number.
  const description = stripHtml(payload.body_html ?? "");
  const tagList = (payload.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const content = [
    payload.title,
    payload.product_type ? `Type: ${payload.product_type}` : "",
    payload.vendor ? `Vendor: ${payload.vendor}` : "",
    tagList.length > 0 ? `Tags: ${tagList.join(", ")}` : "",
    description ? `Description: ${description}` : "",
    `Product page: cocolash.com/products/${payload.handle}`,
  ]
    .filter((s) => s.length > 0)
    .join("\n");

  const hash = await contentHash(content);
  let embedding: number[];
  try {
    embedding = await embed(content);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "embedding_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const result = await upsertChunk(supabase, {
    source_type: "storefront_api",
    source_id: sourceId,
    tier: 3,
    title: payload.title,
    content,
    metadata: {
      handle: payload.handle,
      type: payload.product_type ?? null,
      tags: tagList,
      status: payload.status ?? "active",
    },
    content_hash: hash,
    embedding,
    embedding_model: EMBEDDING_MODEL,
  });

  return new Response(
    JSON.stringify({ received: true, action: result.action }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
