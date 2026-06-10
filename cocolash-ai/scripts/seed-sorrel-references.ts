#!/usr/bin/env tsx
/**
 * Seed Sorrel into the product reference library.
 *
 * Faith reported: "Sorrel doesn't appear in the product reference library ...
 * Sorrel needs to be added." Sorrel exists in lib/brand/product-truth.ts but
 * maps to the shared `single-nude-tray` category, so it is never surfaced by
 * its own name in the reference picker (which lists CATEGORIES, not SKUs).
 *
 * This script creates a dedicated `sorrel` product category and attaches
 * Sorrel-specific reference images so "Sorrel" shows up as its own selectable
 * entry. It is IDEMPOTENT — safe to re-run.
 *
 * Usage (provide at least one source):
 *   # Upload local image files (any format — transcoded to PNG/JPEG):
 *   npx tsx scripts/seed-sorrel-references.ts --images ./sorrel-1.jpg,./sorrel-2.png
 *
 *   # Or reference already-hosted image URLs:
 *   npx tsx scripts/seed-sorrel-references.ts --urls https://…/a.png,https://…/b.png
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * AFTER seeding, optionally point Sorrel at the new category in
 * lib/brand/product-truth.ts so generation uses Sorrel-specific shots:
 *   sku "sorrel"  ->  categoryKey: "sorrel"
 * (Leave it on "single-nude-tray" until images exist so the resolver keeps
 *  returning references in the meantime.)
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { uploadProductImage } from "../lib/supabase/storage";
import { toEnhancorCompatibleImage } from "../lib/image-processing/enhancor-image";

const CATEGORY_KEY = "sorrel";
const CATEGORY_LABEL = "Sorrel";
const CATEGORY_DESCRIPTION =
  "Sorrel — warm-brown single lash tray. Reference shots for video/image generation.";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

async function main(): Promise<void> {
  const imagePaths = splitList(argValue("--images"));
  const imageUrls = splitList(argValue("--urls"));

  if (imagePaths.length === 0 && imageUrls.length === 0) {
    console.error(
      "Provide at least one source: --images <files> and/or --urls <urls>.\n" +
        "See the header of this file for usage."
    );
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Ensure the Sorrel category exists (idempotent on key).
  let categoryId: string;
  const { data: existingCat, error: catErr } = await supabase
    .from("product_categories")
    .select("id")
    .eq("key", CATEGORY_KEY)
    .maybeSingle();
  if (catErr) throw catErr;

  if (existingCat) {
    categoryId = existingCat.id as string;
    console.log(`• Category "${CATEGORY_KEY}" already exists (${categoryId}).`);
  } else {
    const { data: created, error: createErr } = await supabase
      .from("product_categories")
      .insert({
        key: CATEGORY_KEY,
        label: CATEGORY_LABEL,
        description: CATEGORY_DESCRIPTION,
        sort_order: 50,
      })
      .select("id")
      .single();
    if (createErr || !created) throw createErr ?? new Error("category insert failed");
    categoryId = created.id as string;
    console.log(`✓ Created category "${CATEGORY_KEY}" (${categoryId}).`);
  }

  // 2. Collect existing image_urls so re-runs don't duplicate.
  const { data: existingImgs } = await supabase
    .from("product_reference_images")
    .select("image_url, sort_order")
    .eq("category_id", categoryId);
  const existingUrls = new Set((existingImgs ?? []).map((r) => r.image_url as string));
  let nextSortOrder =
    (existingImgs ?? []).reduce(
      (max, r) => Math.max(max, (r.sort_order as number) ?? 0),
      -1
    ) + 1;

  // 3. Upload local files → storage, collect their public URLs + storage paths.
  const toInsert: Array<{ image_url: string; storage_path: string | null }> = [];

  for (const path of imagePaths) {
    const buf = await readFile(path);
    const ext = extname(path).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "image/png";
    const rawFile = new File([new Uint8Array(buf)], basename(path), { type: mime });
    const file = await toEnhancorCompatibleImage(rawFile);
    const { url, path: storagePath } = await uploadProductImage(
      supabase,
      file,
      nextSortOrder
    );
    toInsert.push({ image_url: url, storage_path: storagePath });
    console.log(`  ↑ uploaded ${basename(path)} → ${storagePath}`);
  }

  for (const url of imageUrls) {
    toInsert.push({ image_url: url, storage_path: null });
  }

  // 4. Insert reference rows, skipping any URL already present.
  let inserted = 0;
  for (const rec of toInsert) {
    if (existingUrls.has(rec.image_url)) {
      console.log(`  = skip (already present): ${rec.image_url}`);
      continue;
    }
    const { error: insErr } = await supabase.from("product_reference_images").insert({
      category_id: categoryId,
      image_url: rec.image_url,
      storage_path: rec.storage_path,
      sort_order: nextSortOrder,
    });
    if (insErr) throw insErr;
    existingUrls.add(rec.image_url);
    nextSortOrder += 1;
    inserted += 1;
  }

  console.log(
    `\n✓ Done. Sorrel category now has ${existingUrls.size} reference image(s) ` +
      `(${inserted} new this run). It will appear in the product reference picker.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
