/**
 * lib/chat/tryon.ts — Virtual try-on orchestrator for the chatbot.
 *
 * Resolves the product's image URL (from Storefront API w/ KB fallback),
 * calls composePersonWithProduct (Phase 2 of M2 — `lib/gemini/composition.ts`),
 * persists the resulting try-on image in chat_messages.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { composePersonWithProduct } from "../gemini/composition";
import { getProductByHandle } from "../shopify/storefront";
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

/** Best-effort product image resolver: live Storefront → KB chunk → null. */
export async function resolveProductImage(
  supabase: SupabaseClient,
  productHandle: string
): Promise<string | null> {
  try {
    const live = await getProductByHandle(productHandle);
    if (live?.featuredImage?.url) return live.featuredImage.url;
  } catch {
    // fall through to KB
  }
  // Fallback: pull from knowledge_chunks metadata if present.
  const { data } = await supabase
    .from("knowledge_chunks")
    .select("metadata")
    .eq("source_id", `product_csv:${productHandle}`)
    .maybeSingle();
  const meta = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? null;
  const url = (meta?.image_url ?? meta?.featured_image) as string | undefined;
  return url ?? null;
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
      `No product image available for ${input.productHandle}`,
      404,
      "kb_not_found"
    );
  }

  const composed = await composePersonWithProduct({
    personImageUrl: input.selfieUrl,
    productImageUrl,
    pose: "selfie",
    brandId: "chatbot-tryon",
    outputAspectRatio: "4:5",
  });

  return {
    composedUrl: composed.composedImageUrl,
    storagePath: composed.storagePath,
    productImageUrl,
  };
}
