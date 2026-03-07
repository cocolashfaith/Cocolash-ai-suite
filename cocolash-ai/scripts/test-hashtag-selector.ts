/**
 * Test hashtag selector against live Supabase DB.
 * Run: ./node_modules/.bin/tsx scripts/test-hashtag-selector.ts
 *
 * Uses direct Supabase query (not the server client which needs cookies)
 * to verify the selection algorithm logic.
 */

import { createClient } from "@supabase/supabase-js";
import { PLATFORM_LIMITS } from "../lib/constants/posting-times";
import {
  mapImageContextToCategories,
  selectByPopularity,
} from "../lib/hashtags/selector";
import type { Platform, Hashtag, ImageContext } from "../lib/types";

const supabase = createClient(
  "https://exkdmmxbrsgefpciyqkz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4a2RtbXhicnNnZWZwY2l5cWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDMxOTUsImV4cCI6MjA4NjM3OTE5NX0.kkB0K-IdTqcsCww4x8XOavL801kzZ2KwU7BQyVRNdf0"
);

async function fetchHashtags(filters: {
  categories?: string[];
  platform?: Platform;
  isBranded?: boolean;
  subCategory?: string;
}): Promise<Hashtag[]> {
  let query = supabase
    .from("hashtags")
    .select("*")
    .eq("is_active", true)
    .order("popularity_score", { ascending: false });

  if (filters.categories?.length) query = query.in("category", filters.categories);
  if (filters.isBranded !== undefined) query = query.eq("is_branded", filters.isBranded);
  if (filters.subCategory) query = query.eq("sub_category", filters.subCategory);
  if (filters.platform) query = query.contains("platform", [filters.platform]);

  const { data, error } = await query.limit(100);
  if (error) throw error;
  return (data ?? []) as Hashtag[];
}

function addUnique(target: string[], source: string[], maxAdd: number, blacklist: Set<string>): void {
  const existing = new Set(target.map((t) => t.toLowerCase()));
  let added = 0;
  for (const tag of source) {
    if (added >= maxAdd) break;
    const lower = tag.toLowerCase();
    if (!existing.has(lower) && !blacklist.has(lower)) {
      target.push(tag);
      existing.add(lower);
      added++;
    }
  }
}

async function selectHashtagsTest(ctx: ImageContext, platform: Platform): Promise<string[]> {
  const maxCount = PLATFORM_LIMITS[platform].hashtags;
  const blacklist = new Set<string>();
  const selected: string[] = [];

  const branded = await fetchHashtags({ isBranded: true, platform });
  addUnique(selected, branded.map((t) => t.tag), 3, blacklist);

  const categories = mapImageContextToCategories(ctx);
  const categoryTags = await fetchHashtags({ categories, platform });
  const categoryPicked = selectByPopularity(categoryTags, 8);
  addUnique(selected, categoryPicked, 8, blacklist);

  if (ctx.seasonal) {
    const seasonalTags = await fetchHashtags({ categories: ["seasonal"], subCategory: ctx.seasonal, platform });
    addUnique(selected, seasonalTags.map((t) => t.tag), 3, blacklist);
  }

  const trending = await fetchHashtags({ categories: ["trending-viral"], platform });
  const trendingPicked = selectByPopularity(trending, 3);
  addUnique(selected, trendingPicked, 3, blacklist);

  if (selected.length < maxCount) {
    const general = await fetchHashtags({ categories: ["general-beauty", "community-engagement", "beauty-quotes-inspiration"], platform });
    const remaining = maxCount - selected.length;
    const generalPicked = selectByPopularity(general, remaining);
    addUnique(selected, generalPicked, remaining, blacklist);
  }

  return selected.slice(0, maxCount);
}

const TEST_CONTEXTS: { name: string; ctx: ImageContext; platform: Platform }[] = [
  {
    name: "Instagram — Wispy lash closeup, soft-romantic, bedroom",
    platform: "instagram",
    ctx: { category: "lash-closeup", lashStyle: "wispy", vibe: "soft-romantic", scene: "bedroom", skinTone: "medium-deep", seasonal: null, composition: "solo" },
  },
  {
    name: "TikTok — Dramatic lifestyle, night-out, rooftop",
    platform: "tiktok",
    ctx: { category: "lifestyle", lashStyle: "dramatic", vibe: "night-out", scene: "rooftop", skinTone: "deep", seasonal: null, composition: "solo" },
  },
  {
    name: "Twitter — Product shot, professional vibe",
    platform: "twitter",
    ctx: { category: "product", lashStyle: "natural", vibe: "professional", scene: "studio", skinTone: "medium", seasonal: null, composition: "solo", productSubCategory: "single-black-tray" },
  },
  {
    name: "Instagram — Before-after, with seasonal (summer)",
    platform: "instagram",
    ctx: { category: "before-after", lashStyle: "volume", vibe: "confident-glam", scene: "salon", skinTone: "light", seasonal: "summer", composition: "solo" },
  },
  {
    name: "LinkedIn — Application process, professional",
    platform: "linkedin",
    ctx: { category: "application-process", lashStyle: "hybrid", vibe: "professional", scene: "salon", skinTone: "medium-deep", seasonal: null, composition: "solo" },
  },
];

async function run() {
  console.log("=== Hashtag Selector Test (Live DB) ===\n");

  for (const test of TEST_CONTEXTS) {
    console.log(`▸ ${test.name}`);
    const categories = mapImageContextToCategories(test.ctx);
    console.log(`  Mapped categories: [${categories.join(", ")}]`);

    const tags = await selectHashtagsTest(test.ctx, test.platform);
    const limit = PLATFORM_LIMITS[test.platform].hashtags;
    const withinLimit = tags.length <= limit;

    console.log(`  Hashtags (${tags.length}/${limit}): ${tags.map((t) => `#${t}`).join(" ")}`);
    console.log(`  Within limit: ${withinLimit ? "✅" : "❌"}`);

    const hasBranded = tags.some((t) => t.toLowerCase().startsWith("cocolash"));
    console.log(`  Has branded tag: ${hasBranded ? "✅" : "❌"}`);
    console.log();
  }
}

run().catch((e) => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});
