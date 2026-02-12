/**
 * Migration: Add product_categories and product_reference_images tables.
 *
 * Run: node scripts/migrate-product-categories.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://exkdmmxbrsgefpciyqkz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4a2RtbXhicnNnZWZwY2l5cWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDMxOTUsImV4cCI6MjA4NjM3OTE5NX0.kkB0K-IdTqcsCww4x8XOavL801kzZ2KwU7BQyVRNdf0";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MIGRATION_SQL = `
-- ============================================
-- Product Categories & Reference Images
-- ============================================

-- 1. Create product_categories table
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create product_reference_images table
CREATE TABLE IF NOT EXISTS product_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Disable RLS on these tables (M1 has simple auth)
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reference_images ENABLE ROW LEVEL SECURITY;

-- 4. Create permissive policies
CREATE POLICY "Allow all access to product_categories"
  ON product_categories FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to product_reference_images"
  ON product_reference_images FOR ALL
  USING (true) WITH CHECK (true);

-- 5. Seed the 8 product categories
INSERT INTO product_categories (key, label, description, sort_order) VALUES
  ('single-black-tray', 'Single Black Lid Trays', 'Individual lash pairs in black round trays (Dahlia, Poppy, Marigold, Orchid, Rose)', 1),
  ('single-nude-tray', 'Single Nude Lid Trays', 'Individual lash pairs in nude/brown round trays (Daisy, Iris, Jasmine, Peony, Violet)', 2),
  ('multi-lash-book', 'Multi-Lash Book Boxes', '5-pair lash sets in book-style boxes (black or pink)', 3),
  ('multi-lash-display', 'Multi-Lash Display Boxes', '5-pair sets in window display packaging', 4),
  ('full-kit-pouch', 'Full Kits with Pouch', 'Complete sets including fabric storage pouch', 5),
  ('full-kit-box', 'Full Kits in Box', 'Complete sets in rigid cardboard boxes', 6),
  ('storage-pouch', 'Storage Pouches Only', 'Just the linen/fabric bags without other products', 7),
  ('branding-flatlay', 'Branding & Flatlays', 'Styled overhead shots, pattern arrangements, bulk displays', 8)
ON CONFLICT (key) DO NOTHING;

-- 6. Add indexes
CREATE INDEX IF NOT EXISTS idx_product_ref_images_category
  ON product_reference_images(category_id);

CREATE INDEX IF NOT EXISTS idx_product_categories_sort
  ON product_categories(sort_order);
`;

async function main() {
  console.log("Running product categories migration...\n");

  const { error } = await supabase.rpc("exec_sql", { sql: MIGRATION_SQL });

  if (error) {
    // rpc might not exist, try individual operations
    console.log("RPC not available, running operations via client...\n");

    // We'll use the REST API to run SQL. Since we can't run raw SQL via the
    // anon key easily, let's use the Supabase client to check if tables exist
    // and create the categories if possible.

    // First, check if we can access product_categories
    const { data: existing, error: checkError } = await supabase
      .from("product_categories")
      .select("key")
      .limit(1);

    if (checkError && checkError.message.includes("does not exist")) {
      console.error(
        "Tables don't exist yet. Please run the following SQL in the Supabase SQL Editor:\n"
      );
      console.log(MIGRATION_SQL);
      console.log(
        "\nAfter running the SQL, re-run this script to seed the categories."
      );
      process.exit(1);
    }

    if (checkError) {
      console.error("Error checking tables:", checkError.message);
      console.log("\nPlease run the following SQL in the Supabase SQL Editor:\n");
      console.log(MIGRATION_SQL);
      process.exit(1);
    }

    // Tables exist, check if categories are seeded
    if (existing && existing.length > 0) {
      console.log("Categories already seeded. Checking count...");
      const { count } = await supabase
        .from("product_categories")
        .select("*", { count: "exact", head: true });
      console.log(`Found ${count} categories.`);

      if (count && count < 8) {
        console.log("Seeding missing categories...");
        await seedCategories();
      } else {
        console.log("All 8 categories present. Migration complete!");
      }
    } else {
      console.log("Tables exist but empty. Seeding categories...");
      await seedCategories();
    }
  } else {
    console.log("Migration SQL executed successfully!");
  }
}

async function seedCategories() {
  const categories = [
    {
      key: "single-black-tray",
      label: "Single Black Lid Trays",
      description:
        "Individual lash pairs in black round trays (Dahlia, Poppy, Marigold, Orchid, Rose)",
      sort_order: 1,
    },
    {
      key: "single-nude-tray",
      label: "Single Nude Lid Trays",
      description:
        "Individual lash pairs in nude/brown round trays (Daisy, Iris, Jasmine, Peony, Violet)",
      sort_order: 2,
    },
    {
      key: "multi-lash-book",
      label: "Multi-Lash Book Boxes",
      description: "5-pair lash sets in book-style boxes (black or pink)",
      sort_order: 3,
    },
    {
      key: "full-kit-pouch",
      label: "Full Kits with Pouch",
      description: "Complete sets including fabric storage pouch",
      sort_order: 4,
    },
    {
      key: "full-kit-box",
      label: "Full Kits in Box",
      description: "Complete sets in rigid cardboard boxes",
      sort_order: 6,
    },
    {
      key: "storage-pouch",
      label: "Storage Pouches Only",
      description: "Just the linen/fabric bags without other products",
      sort_order: 7,
    },
    {
      key: "branding-flatlay",
      label: "Branding & Flatlays",
      description:
        "Styled overhead shots, pattern arrangements, bulk displays",
      sort_order: 8,
    },
  ];

  for (const cat of categories) {
    const { error } = await supabase
      .from("product_categories")
      .upsert(cat, { onConflict: "key" });

    if (error) {
      console.error(`Failed to seed '${cat.key}':`, error.message);
    } else {
      console.log(`  ✓ ${cat.key}: ${cat.label}`);
    }
  }

  console.log("\nDone seeding categories!");
}

main().catch(console.error);
