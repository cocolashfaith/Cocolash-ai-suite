/**
 * One-time script to upload product reference images to Supabase Storage
 * and update the brand profile with their URLs.
 *
 * Usage: node scripts/upload-products.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://exkdmmxbrsgefpciyqkz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4a2RtbXhicnNnZWZwY2l5cWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDMxOTUsImV4cCI6MjA4NjM3OTE5NX0.kkB0K-IdTqcsCww4x8XOavL801kzZ2KwU7BQyVRNdf0";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ASSETS_DIR = "/Users/harry/.cursor/projects/Users-harry-Documents-Working-Projects-Faith-Project-CODE/assets";

const productFiles = [
  "CocoLash_r1_770A9530-1732b04d-5d6f-4f47-85a7-c8256ba3dcea.png",
  "CocoLash_r1_770A9557-397cbab8-de30-409c-9a91-b803444a84a1.png",
  "CocoLash_r1_770A9602-73be030c-1534-4345-ad66-97b98528e508.png",
  "CocoLash_r1_770A9649-662afae5-cb1b-4fbe-b3c1-0d81ac98bdf0.png",
  "CocoLash_r1_770A9672-d17f9800-6b36-412a-94d7-f7fe666dbf72.png",
];

async function main() {
  console.log("Uploading 5 product reference images...\n");
  
  const urls = [];
  
  for (let i = 0; i < productFiles.length; i++) {
    const filename = productFiles[i];
    const filePath = path.join(ASSETS_DIR, filename);
    
    console.log(`[${i + 1}/5] Uploading: ${filename}`);
    
    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = `products/product-${i}-${Date.now()}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from("brand-assets")
      .upload(storagePath, fileBuffer, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      });
    
    if (uploadError) {
      console.error(`  ERROR: ${uploadError.message}`);
      continue;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from("brand-assets")
      .getPublicUrl(storagePath);
    
    urls.push(publicUrl);
    console.log(`  OK: ${publicUrl.substring(0, 80)}...`);
  }
  
  console.log(`\nUploaded ${urls.length}/5 images. Updating brand profile...\n`);
  
  // Get the brand profile ID
  const { data: profiles, error: fetchError } = await supabase
    .from("brand_profiles")
    .select("id")
    .limit(1);
  
  if (fetchError || !profiles || profiles.length === 0) {
    console.error("Failed to fetch brand profile:", fetchError?.message);
    process.exit(1);
  }
  
  const brandId = profiles[0].id;
  
  // Update the product_image_urls
  const { error: updateError } = await supabase
    .from("brand_profiles")
    .update({ product_image_urls: urls })
    .eq("id", brandId);
  
  if (updateError) {
    console.error("Failed to update brand profile:", updateError.message);
    process.exit(1);
  }
  
  console.log(`Brand profile updated with ${urls.length} product image URLs.`);
  console.log("\nDone! Refresh the Settings page to see them.");
}

main().catch(console.error);
