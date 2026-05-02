/**
 * lib/chat/tryon.ts — Virtual try-on orchestrator for the chatbot.
 *
 * Resolves the lash REFERENCE image (curated → KB → Storefront fallback),
 * calls `composeTryOn` (Phase 12 lash-application prompt), persists the
 * resulting image in chat_messages.
 *
 * The chatbot try-on intentionally uses a different composition path from
 * the M1 marketing UGC pipeline (`lib/gemini/composition.ts`). The M1
 * prompts ask Gemini to generate a *new* photo of a model holding the
 * product; the try-on prompts ask Gemini to APPLY the lashes to the user's
 * actual face without changing anything else.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { composeTryOn } from "./tryon-compose";
import { getProductByHandle } from "../shopify/storefront";
import { getTryOnRefUrl } from "./tryon-refs";
import { ChatError } from "./error";

export interface TryOnInput {
  sessionId: string;
  productHandle: string;
  selfieUrl: string;
}

export interface TryOnResult {
  composedUrl: string;
  storagePath: string;
  productImageUrl: string;
}

/**
 * Best-effort lash reference resolver:
 *   1. curated `tryon-refs/<style>.jpg` for known styles (preferred)
 *   2. KB chunk metadata `image_url` (legacy)
 *   3. Storefront featured image (last-resort fallback; may include a model
 *      and yield poor try-on results)
 */
export async function resolveProductImage(
  supabase: SupabaseClient,
  productHandle: string
): Promise<string | null> {
  // Step 1 — curated lash-only reference (Phase 12)
  const curated = getTryOnRefUrl(productHandle);
  if (curated) return curated;

  // Step 2 — KB metadata fallback
  const { data } = await supabase
    .from("knowledge_chunks")
    .select("metadata")
    .eq("source_id", `product_csv:${productHandle}`)
    .maybeSingle();
  const meta = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? null;
  const url = (meta?.image_url ?? meta?.featured_image) as string | undefined;
  if (url) return url;

  // Step 3 — Storefront featured image
  try {
    const live = await getProductByHandle(productHandle);
    if (live?.featuredImage?.url) return live.featuredImage.url;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Run the try-on. Throws ChatError on missing product image or compose failure.
 */
export async function runTryOn(
  supabase: SupabaseClient,
  input: TryOnInput
): Promise<TryOnResult> {
  const productImageUrl = await resolveProductImage(supabase, input.productHandle);
  if (!productImageUrl) {
    throw new ChatError(
      `No try-on reference available for ${input.productHandle}`,
      404,
      "kb_not_found"
    );
  }

  const composed = await composeTryOn({
    selfieUrl: input.selfieUrl,
    lashRefUrl: productImageUrl,
    brandId: "chatbot-tryon",
  });

  return {
    composedUrl: composed.composedImageUrl,
    storagePath: composed.storagePath,
    productImageUrl,
  };
}
