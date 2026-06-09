/**
 * Phase 34.1 Group D end-to-end check (throwaway; OpenRouter only, no paid render).
 *
 * Exercises the REAL production path:
 *   1. extractProductFacts(images)        ← the new vision extractor
 *   2. formatProductFactsForPrompt(facts) ← the shared grounding block
 *   3. generateVideoScript({ ..., productFacts }) ← script generator, grounded
 *   4. detectPhantomFeatures(script)      ← honesty backstop
 *
 * Run: ./node_modules/.bin/tsx scripts/validate-grounded-pipeline.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  extractProductFacts,
  formatProductFactsForPrompt,
} from "../lib/ai/director/product-fact-extractor";
import { generateVideoScript } from "../lib/openrouter/captions";
import { detectPhantomFeatures } from "../lib/brand/product-truth";

const CATEGORY_KEY = "multi-lash-book";

async function resolveImages(): Promise<string[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: cat } = await supabase
    .from("product_categories")
    .select("id")
    .eq("key", CATEGORY_KEY)
    .maybeSingle();
  if (!cat?.id) throw new Error(`no category ${CATEGORY_KEY}`);
  const { data: rows } = await supabase
    .from("product_reference_images")
    .select("image_url")
    .eq("category_id", cat.id as string)
    .order("sort_order", { ascending: true });
  return (rows ?? []).map((r) => r.image_url as string);
}

async function main() {
  console.log("=== Group D: real extract-once → grounded-script pipeline ===");
  const images = await resolveImages();
  console.log(`Images: ${images.length}`);

  console.log("\n[1] Extracting product facts (one vision call)…");
  const facts = await extractProductFacts(images);
  console.log(JSON.stringify(facts, null, 2));

  const block = formatProductFactsForPrompt(facts);
  console.log("\n[2] Formatted grounding block:\n" + block);

  console.log("\n[3] Generating grounded scripts (unboxing, 10s)…");
  const scripts = await generateVideoScript({
    pipeline: "seedance",
    campaignType: "unboxing",
    tone: "casual",
    duration: 10,
    productFacts: block,
  });

  let phantoms = 0;
  scripts.forEach((s, i) => {
    const p = detectPhantomFeatures(s.full_script);
    phantoms += p.length;
    console.log(`\n[${i + 1}] (${s.full_script.split(/\s+/).length} words) ${s.full_script}`);
    p.forEach((m) => console.log(`    ⚠️  ${m}`));
  });

  console.log(`\n=== Phantom hits: ${phantoms} ===`);
  console.log(
    facts.isNot.some((x) => /magnet/i.test(x))
      ? "✅ extractor correctly flagged 'no magnetic closure' for this product"
      : "ℹ️  extractor did not list a magnetic exclusion"
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
