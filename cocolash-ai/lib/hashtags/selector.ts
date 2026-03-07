import { createClient } from "@/lib/supabase/server";
import { PLATFORM_LIMITS } from "@/lib/constants/posting-times";
import type {
  Platform,
  Hashtag,
  ImageContext,
  LashStyle,
  Vibe,
  Scene,
  ContentCategory,
} from "@/lib/types";
import type { HashtagCategory } from "@/lib/constants/hashtags";

// ── Cache (5-minute TTL) ──────────────────────────────────────

interface CacheEntry {
  data: Hashtag[];
  ts: number;
}

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function getCached(key: string): Hashtag[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: Hashtag[]): void {
  cache.set(key, { data, ts: Date.now() });
}

// ── Public API ────────────────────────────────────────────────

export interface SelectHashtagsParams {
  imageContext: ImageContext;
  platform: Platform;
  captionText?: string;
  neverInclude?: string[];
}

export async function selectHashtags(
  params: SelectHashtagsParams
): Promise<string[]> {
  const { imageContext, platform, neverInclude = [] } = params;
  const maxCount = PLATFORM_LIMITS[platform].hashtags;
  const blacklist = new Set(neverInclude.map((t) => t.toLowerCase()));

  const selected: string[] = [];

  const branded = await getBrandedHashtags(platform);
  addUnique(selected, branded, 3, blacklist);

  const categories = mapImageContextToCategories(imageContext);
  const categoryTags = await getHashtagsByCategories(categories, platform);
  const categoryPicked = selectByPopularity(categoryTags, 8);
  addUnique(selected, categoryPicked, 8, blacklist);

  if (imageContext.seasonal) {
    const seasonalTags = await getSeasonalHashtags(
      imageContext.seasonal,
      platform
    );
    addUnique(selected, seasonalTags, 3, blacklist);
  }

  const trending = await getTrendingHashtags(platform);
  const trendingPicked = selectByPopularity(trending, 3);
  addUnique(selected, trendingPicked, 3, blacklist);

  if (selected.length < maxCount) {
    const general = await getGeneralBeautyHashtags(platform);
    const remaining = maxCount - selected.length;
    const generalPicked = selectByPopularity(general, remaining);
    addUnique(selected, generalPicked, remaining, blacklist);
  }

  return selected.slice(0, maxCount);
}

// ── Context → Category Mapping ────────────────────────────────

const LASH_STYLE_MAP: Partial<Record<LashStyle, HashtagCategory[]>> = {
  natural: ["lash-styles", "daily-routines-lifestyle"],
  volume: ["lash-styles", "makeup-looks-aesthetics"],
  dramatic: ["lash-styles", "makeup-looks-aesthetics", "confidence-empowerment"],
  "cat-eye": ["lash-styles", "eye-makeup"],
  wispy: ["lash-styles", "eye-makeup"],
  "doll-eye": ["lash-styles", "eye-makeup"],
  hybrid: ["lash-styles"],
  "mega-volume": ["lash-styles", "makeup-looks-aesthetics", "confidence-empowerment"],
};

const VIBE_MAP: Partial<Record<Vibe, HashtagCategory[]>> = {
  "confident-glam": ["confidence-empowerment", "makeup-looks-aesthetics"],
  "soft-romantic": ["self-care-wellness", "daily-routines-lifestyle"],
  "bold-editorial": ["makeup-looks-aesthetics", "beauty-creator-influencer"],
  "natural-beauty": ["melanin-beauty", "self-care-wellness"],
  "night-out": ["occasions", "confidence-empowerment"],
  "self-care": ["self-care-wellness", "daily-routines-lifestyle"],
  professional: ["confidence-empowerment"],
};

const SCENE_MAP: Partial<Record<Scene, HashtagCategory[]>> = {
  studio: ["beauty-creator-influencer"],
  bedroom: ["daily-routines-lifestyle"],
  cafe: ["daily-routines-lifestyle", "occasions"],
  "outdoor-golden-hour": ["melanin-beauty"],
  rooftop: ["occasions", "confidence-empowerment"],
  salon: ["application-tips"],
  "bathroom-vanity": ["daily-routines-lifestyle", "self-care-wellness"],
  "minimalist-backdrop": ["beauty-creator-influencer"],
};

const CATEGORY_MAP: Partial<Record<ContentCategory, HashtagCategory[]>> = {
  "lash-closeup": ["eye-makeup", "lash-styles"],
  lifestyle: ["daily-routines-lifestyle", "confidence-empowerment"],
  product: ["product-review", "shopping-hauls", "cocolash-kit"],
  "before-after": ["makeup-looks-aesthetics", "confidence-empowerment"],
  "application-process": ["application-tips", "beauty-creator-influencer"],
};

export function mapImageContextToCategories(
  ctx: ImageContext
): HashtagCategory[] {
  const cats = new Set<HashtagCategory>();

  const fromCategory = CATEGORY_MAP[ctx.category];
  if (fromCategory) fromCategory.forEach((c) => cats.add(c));

  const fromLash = LASH_STYLE_MAP[ctx.lashStyle];
  if (fromLash) fromLash.forEach((c) => cats.add(c));

  const fromVibe = VIBE_MAP[ctx.vibe];
  if (fromVibe) fromVibe.forEach((c) => cats.add(c));

  const fromScene = SCENE_MAP[ctx.scene];
  if (fromScene) fromScene.forEach((c) => cats.add(c));

  cats.add("melanin-beauty");

  if (cats.size === 0) {
    cats.add("general-beauty");
    cats.add("eye-makeup");
  }

  return [...cats];
}

// ── DB Fetch Helpers ──────────────────────────────────────────

async function fetchHashtags(
  filters: {
    categories?: string[];
    platform?: Platform;
    isBranded?: boolean;
    subCategory?: string;
  },
  cacheKey: string
): Promise<Hashtag[]> {
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const supabase = await createClient();
  let query = supabase
    .from("hashtags")
    .select("*")
    .eq("is_active", true)
    .order("popularity_score", { ascending: false });

  if (filters.categories && filters.categories.length > 0) {
    query = query.in("category", filters.categories);
  }
  if (filters.isBranded !== undefined) {
    query = query.eq("is_branded", filters.isBranded);
  }
  if (filters.subCategory) {
    query = query.eq("sub_category", filters.subCategory);
  }
  if (filters.platform) {
    query = query.contains("platform", [filters.platform]);
  }

  const { data, error } = await query.limit(100);
  if (error) {
    console.error("[hashtag-selector] DB error:", error.message);
    return [];
  }

  const results = (data ?? []) as Hashtag[];
  setCache(cacheKey, results);
  return results;
}

async function getBrandedHashtags(platform: Platform): Promise<string[]> {
  const tags = await fetchHashtags(
    { isBranded: true, platform },
    `branded:${platform}`
  );
  return tags.map((t) => t.tag);
}

async function getHashtagsByCategories(
  categories: HashtagCategory[],
  platform: Platform
): Promise<Hashtag[]> {
  const key = `cats:${categories.sort().join(",")}:${platform}`;
  return fetchHashtags({ categories, platform }, key);
}

async function getSeasonalHashtags(
  season: string,
  platform: Platform
): Promise<string[]> {
  const tags = await fetchHashtags(
    { categories: ["seasonal"], subCategory: season, platform },
    `seasonal:${season}:${platform}`
  );
  return tags.map((t) => t.tag);
}

async function getTrendingHashtags(platform: Platform): Promise<Hashtag[]> {
  return fetchHashtags(
    { categories: ["trending-viral"], platform },
    `trending:${platform}`
  );
}

async function getGeneralBeautyHashtags(platform: Platform): Promise<Hashtag[]> {
  return fetchHashtags(
    { categories: ["general-beauty", "community-engagement", "beauty-quotes-inspiration"], platform },
    `general:${platform}`
  );
}

// ── Selection Utilities ───────────────────────────────────────

export function selectByPopularity(
  hashtags: Hashtag[],
  count: number
): string[] {
  if (hashtags.length <= count) return hashtags.map((h) => h.tag);

  const totalWeight = hashtags.reduce(
    (sum, h) => sum + h.popularity_score,
    0
  );
  const selected: string[] = [];
  const used = new Set<number>();

  while (selected.length < count && used.size < hashtags.length) {
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < hashtags.length; i++) {
      if (used.has(i)) continue;
      rand -= hashtags[i].popularity_score;
      if (rand <= 0) {
        selected.push(hashtags[i].tag);
        used.add(i);
        break;
      }
    }
  }

  return selected;
}

function addUnique(
  target: string[],
  source: string[],
  maxAdd: number,
  blacklist: Set<string>
): void {
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
