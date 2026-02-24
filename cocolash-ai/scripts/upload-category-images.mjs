/**
 * Upload reference images for a specific product category.
 *
 * Usage: node scripts/upload-category-images.mjs <category-key> <image1> <image2> ...
 *
 * Example:
 *   node scripts/upload-category-images.mjs single-black-tray /path/to/img1.png /path/to/img2.png
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const categoryKey = process.argv[2];
const imagePaths = process.argv.slice(3);

if (!categoryKey || imagePaths.length === 0) {
  console.error("Usage: node upload-category-images.mjs <category-key> <image1> [image2] ...");
  process.exit(1);
}

async function main() {
  // 1. Look up the category
  const { data: category, error: catError } = await supabase
    .from("product_categories")
    .select("id, label")
    .eq("key", categoryKey)
    .single();

  if (catError || !category) {
    console.error(`Category "${categoryKey}" not found:`, catError?.message);
    process.exit(1);
  }

  console.log(`\nCategory: ${category.label} (${categoryKey})`);
  console.log(`Uploading ${imagePaths.length} image(s)...\n`);

  // 2. Get current max sort_order
  const { data: existing } = await supabase
    .from("product_reference_images")
    .select("sort_order")
    .eq("category_id", category.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  let nextSort = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  // 3. Upload each image
  for (let i = 0; i < imagePaths.length; i++) {
    const filePath = imagePaths[i];
    const basename = path.basename(filePath);
    const ext = path.extname(filePath) || ".png";
    const uuid = crypto.randomUUID();

    console.log(`[${i + 1}/${imagePaths.length}] ${basename}`);

    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = `products/${categoryKey}/${uuid}${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("brand-assets")
      .upload(storagePath, fileBuffer, {
        contentType: `image/${ext.replace(".", "")}`,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error(`  ERROR uploading: ${uploadError.message}`);
      continue;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("brand-assets").getPublicUrl(storagePath);

    const imageUrl = `${publicUrl}?t=${Date.now()}`;

    // Insert into product_reference_images
    const { error: insertError } = await supabase
      .from("product_reference_images")
      .insert({
        category_id: category.id,
        image_url: imageUrl,
        storage_path: storagePath,
        sort_order: nextSort++,
      });

    if (insertError) {
      console.error(`  ERROR inserting DB record: ${insertError.message}`);
      continue;
    }

    console.log(`  ✓ Uploaded & registered (sort: ${nextSort - 1})`);
  }

  // 4. Verify
  const { count } = await supabase
    .from("product_reference_images")
    .select("*", { count: "exact", head: true })
    .eq("category_id", category.id);

  console.log(`\nDone! "${category.label}" now has ${count} reference image(s).`);
}

main().catch(console.error);
