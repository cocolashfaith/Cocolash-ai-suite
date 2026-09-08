/**
 * GET /api/shopify/product-images — live Shopify imagery for the wizard's
 * "Store products" tab (Seedance 2.5, D7).
 *
 * The seeded reference library is keyed by PACKAGING category, so newer SKUs
 * (Sorrel, Fern, Ivy) have no entry until the seed script runs. Shopify always
 * has them, with every angle — hence "all images", not just `featuredImage`.
 *
 * Only PNG/JPEG originals are returned: Enhancor rejects WebP/AVIF/GIF with a
 * 400, and these URLs are handed to it verbatim. The `?v=` query string is
 * part of a Shopify CDN URL — it is never stripped.
 *
 * Contract (§2.11):
 *   200 { products: [{ handle, title, productType, available, images[] }], fetchedAt, cached }
 *   503 { error: "shopify_not_configured" }  — missing domain/token
 *   502 { error: "shopify_unavailable" }     — anything else
 */

import { NextResponse } from "next/server";
import {
  lastListProductsWasCached,
  listProductsWithImages,
} from "@/lib/shopify/storefront";
import { ShopifyError, type ShopifyProductImage } from "@/lib/shopify/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enhancor accepts PNG and JPEG only. */
const ALLOWED_EXT = /\.(png|jpg|jpeg)$/i;

interface PickerImage {
  url: string;
  alt: string | null;
  width?: number;
  height?: number;
}

function toPickerImages(
  images: ShopifyProductImage[] | undefined,
  featured: ShopifyProductImage | null
): PickerImage[] {
  const source = images && images.length > 0 ? images : featured ? [featured] : [];
  const out: PickerImage[] = [];
  const seen = new Set<string>();

  for (const image of source) {
    if (!image?.url || seen.has(image.url)) continue;
    let pathname: string;
    try {
      pathname = new URL(image.url).pathname;
    } catch {
      continue; // malformed URL — skip rather than blow up the whole list
    }
    if (!ALLOWED_EXT.test(pathname)) continue;

    seen.add(image.url);
    const entry: PickerImage = { url: image.url, alt: image.altText ?? null };
    if (typeof image.width === "number") entry.width = image.width;
    if (typeof image.height === "number") entry.height = image.height;
    out.push(entry);
  }
  return out;
}

export async function GET() {
  try {
    const products = await listProductsWithImages();

    return NextResponse.json({
      products: products.map((p) => ({
        handle: p.handle,
        title: p.title,
        productType: p.productType,
        available: p.availableForSale,
        images: toPickerImages(p.images, p.featuredImage),
      })),
      fetchedAt: new Date().toISOString(),
      cached: Boolean(lastListProductsWasCached()),
    });
  } catch (error: unknown) {
    if (error instanceof ShopifyError && error.code === "missing_api_key") {
      console.error("[shopify/product-images] not configured:", error.message);
      return NextResponse.json({ error: "shopify_not_configured" }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[shopify/product-images] unavailable:", message);
    return NextResponse.json({ error: "shopify_unavailable" }, { status: 502 });
  }
}
