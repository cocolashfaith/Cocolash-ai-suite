#!/usr/bin/env tsx
/**
 * Seed per-SKU product reference categories from LIVE Shopify imagery (D7).
 *
 * Why: the reference library is keyed by PACKAGING, not by SKU, so Sorrel was
 * grounded on `single-nude-tray` photos (black lashes — Sorrel is dark brown)
 * and the two half-lash kits, Fern and Ivy, had no imagery at all. Shopify has
 * all of it: sorrel 6 images, fern 8, ivy 7, all public on cdn.shopify.com.
 *
 * What it does, per handle:
 *   1. `getProductByHandle` (Storefront API — read-only)
 *   2. ensure a `product_categories` row with key = handle
 *   3. for every PNG/JPEG image: fetch bytes → `toEnhancorCompatibleImage`
 *      → upload to `brand-assets/products/shopify/<handle>-<n>.<ext>`
 *      → insert a `product_reference_images` row unless that image_url is
 *        already attached to the category
 *
 * Images are RE-HOSTED rather than linked: `product_reference_images.storage_path`
 * is NOT NULL, and a Shopify CDN URL has no storage path. Re-hosting also
 * insulates the library from a Shopify re-upload changing the `?v=` token.
 *
 * IDEMPOTENT: the storage path is deterministic (upsert) and rows are deduped
 * on image_url, so re-running changes nothing.
 *
 * Usage:
 *   npx tsx scripts/seed-shopify-references.ts --handles sorrel,fern,ivy --dry-run
 *   npx tsx scripts/seed-shopify-references.ts --handles sorrel,fern,ivy
 *
 * --dry-run performs NO writes (no storage upload, no insert). It still reads
 * Shopify and, when Supabase credentials are present, reports what already
 * exists. It also PRINTS each product description — that copy is the only
 * source allowed for the Fern/Ivy facts in lib/brand/product-truth.ts.
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SHOPIFY_STORE_DOMAIN, SHOPIFY_STOREFRONT_API_TOKEN,
 * SHOPIFY_STOREFRONT_API_VERSION.
 *
 * Supersedes scripts/seed-sorrel-references.ts (deleted — it required images to
 * be passed by hand and never ran).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getProductByHandle } from "../lib/shopify/storefront";
import type { ShopifyProduct, ShopifyProductImage } from "../lib/shopify/types";
import { toEnhancorCompatibleImage } from "../lib/image-processing/enhancor-image";
import { uploadProductImageToPath } from "../lib/supabase/storage";

const DEFAULT_HANDLES = ["sorrel", "fern", "ivy"];
/** Per-SKU categories sort after the seven packaging categories. */
const SORT_ORDER_BASE = 50;
/** brand-assets caps at 5 MB per object. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = /\.(png|jpg|jpeg)$/i;

interface PlannedImage {
  index: number;
  sourceUrl: string;
  storagePath: string;
  ext: string;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function extForUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const match = pathname.match(ALLOWED_EXT);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function usableImages(product: ShopifyProduct): ShopifyProductImage[] {
  const all =
    product.images && product.images.length > 0
      ? product.images
      : product.featuredImage
        ? [product.featuredImage]
        : [];
  const seen = new Set<string>();
  return all.filter((image) => {
    if (!image?.url || seen.has(image.url)) return false;
    if (!extForUrl(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function planImages(product: ShopifyProduct): PlannedImage[] {
  return usableImages(product).map((image, index) => {
    const ext = extForUrl(image.url) ?? "png";
    return {
      index,
      sourceUrl: image.url,
      // Deterministic: a re-run upserts the same object.
      storagePath: `products/shopify/${product.handle}-${index + 1}.${ext}`,
      ext,
    };
  });
}

function categoryDescription(product: ShopifyProduct): string {
  const summary = (product.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  return [product.productType, summary].filter(Boolean).join(" — ");
}

async function fetchImageFile(url: string, ext: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  let mime = ext === "png" ? "image/png" : "image/jpeg";
  let filename = name;

  // `brand-assets` rejects anything over 5 MB. Fern/Ivy ship 5184×3456
  // originals, so downscale instead of failing the seed — Seedance references
  // are never displayed above ~2K anyway.
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    const resized = await sharp(Buffer.from(bytes))
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    console.log(
      `  ↓ downscaled ${name}: ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB → ` +
        `${(resized.byteLength / 1024 / 1024).toFixed(1)} MB`
    );
    bytes = new Uint8Array(resized);
    mime = "image/jpeg";
    filename = name.replace(/\.[^.]+$/, ".jpg");
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`${name} is still over the 5 MB brand-assets cap after downscaling`);
    }
  }

  return new File([bytes], filename, { type: mime });
}

async function ensureCategory(
  supabase: SupabaseClient,
  product: ShopifyProduct,
  sortOrder: number,
  dryRun: boolean
): Promise<{ id: string | null; created: boolean }> {
  const { data: existing, error } = await supabase
    .from("product_categories")
    .select("id, label, description")
    .eq("key", product.handle)
    .maybeSingle();
  if (error) throw error;

  if (existing) {
    return { id: existing.id as string, created: false };
  }
  if (dryRun) return { id: null, created: true };

  const { data: created, error: createErr } = await supabase
    .from("product_categories")
    .insert({
      key: product.handle,
      label: product.title,
      description: categoryDescription(product),
      sort_order: sortOrder,
    })
    .select("id")
    .single();
  if (createErr || !created) throw createErr ?? new Error("category insert failed");
  return { id: created.id as string, created: true };
}

async function existingImageUrls(
  supabase: SupabaseClient,
  categoryId: string
): Promise<{ urls: Set<string>; nextSortOrder: number }> {
  const { data, error } = await supabase
    .from("product_reference_images")
    .select("image_url, sort_order")
    .eq("category_id", categoryId);
  if (error) throw error;

  const rows = data ?? [];
  const urls = new Set(rows.map((r) => r.image_url as string));
  const nextSortOrder =
    rows.reduce((max, r) => Math.max(max, (r.sort_order as number) ?? -1), -1) + 1;
  return { urls, nextSortOrder };
}

async function main(): Promise<void> {
  const dryRun = hasFlag("--dry-run");
  const handles = splitList(argValue("--handles"));
  const targets = handles.length > 0 ? handles : DEFAULT_HANDLES;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
    console.error(
      "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
    process.exit(1);
  }

  const supabase =
    supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

  console.log(
    `${dryRun ? "DRY RUN — no writes" : "SEEDING"} · handles: ${targets.join(", ")}` +
      (supabase ? "" : "  (no Supabase credentials — Shopify report only)")
  );

  let categoriesCreated = 0;
  let imagesInserted = 0;
  let imagesSkipped = 0;
  let sortOrder = SORT_ORDER_BASE;
  const missing: string[] = [];

  for (const handle of targets) {
    console.log(`\n${"=".repeat(72)}`);
    const product = await getProductByHandle(handle);
    if (!product) {
      console.log(`✗ ${handle}: not found on Shopify — skipped.`);
      missing.push(handle);
      continue;
    }

    const plan = planImages(product);
    console.log(
      `${product.handle} · "${product.title}" · type="${product.productType}" · ` +
        `tags=[${product.tags.join(", ")}] · available=${product.availableForSale}`
    );
    console.log(
      `images: ${plan.length} usable PNG/JPEG` +
        (product.images ? ` of ${product.images.length} total` : "")
    );
    // The product description is the ONLY sanctioned source for the Fern/Ivy
    // facts in lib/brand/product-truth.ts — print it in full.
    console.log(`description:\n  ${(product.description ?? "").replace(/\n/g, "\n  ")}`);

    if (!supabase) {
      for (const img of plan) console.log(`  · ${img.storagePath}  ←  ${img.sourceUrl}`);
      sortOrder += 1;
      continue;
    }

    const { id: categoryId, created } = await ensureCategory(
      supabase,
      product,
      sortOrder,
      dryRun
    );
    sortOrder += 1;
    if (created) {
      categoriesCreated += 1;
      console.log(
        `${dryRun ? "would create" : "✓ created"} category "${product.handle}" ` +
          `(label="${product.title}", sort_order=${sortOrder - 1})`
      );
      console.log(`  description → ${categoryDescription(product)}`);
    } else {
      console.log(`• category "${product.handle}" already exists (${categoryId}).`);
    }

    const { urls, nextSortOrder } = categoryId
      ? await existingImageUrls(supabase, categoryId)
      : { urls: new Set<string>(), nextSortOrder: 0 };
    let imageSort = nextSortOrder;

    for (const img of plan) {
      if (dryRun) {
        // The stored URL is only known after upload, so a dry run can only
        // report the source → destination mapping, not the dedupe outcome.
        console.log(`  would re-host ${img.sourceUrl}\n            → ${img.storagePath}`);
        continue;
      }

      const file = await fetchImageFile(
        img.sourceUrl,
        img.ext,
        `${product.handle}-${img.index + 1}.${img.ext}`
      );
      const compatible = await toEnhancorCompatibleImage(file);
      const { url, path } = await uploadProductImageToPath(
        supabase,
        compatible,
        img.storagePath,
        { upsert: true }
      );

      if (urls.has(url)) {
        imagesSkipped += 1;
        console.log(`  = already linked: ${path}`);
        continue;
      }

      const { error: insErr } = await supabase.from("product_reference_images").insert({
        category_id: categoryId,
        image_url: url,
        storage_path: path,
        sort_order: imageSort,
      });
      if (insErr) throw insErr;
      urls.add(url);
      imageSort += 1;
      imagesInserted += 1;
      console.log(`  ↑ ${path}`);
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  if (dryRun) {
    console.log(
      `DRY RUN complete. ${targets.length - missing.length}/${targets.length} handles resolved; ` +
        `no rows written, no bytes uploaded.`
    );
  } else {
    console.log(
      `Done. Categories created: ${categoriesCreated}. ` +
        `Reference images inserted: ${imagesInserted} (skipped ${imagesSkipped} already present).`
    );
  }
  if (missing.length > 0) console.log(`Handles not found on Shopify: ${missing.join(", ")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
