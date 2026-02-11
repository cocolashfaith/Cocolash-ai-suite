/**
 * CocoLash Prompt Composer
 *
 * The master assembler that builds the final prompt from:
 *   BRAND_DNA + CATEGORY_TEMPLATE(selections) + NEGATIVE_PROMPT
 *
 * Handles "random" resolution for skin tone, hair style, scene, and vibe.
 * Records resolved values for the diversity tracker.
 */
import type {
  GenerationSelections,
  SkinTone,
  HairStyle,
  Scene,
  Vibe,
  ContentCategory,
} from "@/lib/types";
import { getBrandDNA } from "./brand-dna";
import { getNegativePrompt, getSafeNegativePrompt } from "./negative";
import { buildLashCloseupPrompt } from "./categories/lash-closeup";
import { buildLifestylePrompt } from "./categories/lifestyle";
import { buildProductPrompt } from "./categories/product";
import { SKIN_TONE_TIERS } from "./modules/skin-tones";
import { ALL_HAIR_STYLES } from "./modules/hair-styles";
import { ALL_SCENES, SCENES_BY_CATEGORY } from "./modules/scenes";
import { ALL_VIBES } from "./modules/vibes";

// ── Types for the compose result ──────────────────────────────
export interface ComposedPrompt {
  /** The full prompt to send to Gemini */
  fullPrompt: string;
  /** The category-specific portion (for display/storage) */
  categoryPrompt: string;
  /** Resolved selections (all "random" values replaced) */
  resolvedSelections: {
    skinTone: Exclude<SkinTone, "random">;
    hairStyle: Exclude<HairStyle, "random">;
    scene: Exclude<Scene, "random">;
    vibe: Exclude<Vibe, "random">;
  };
}

// ── Random Resolution Helpers ─────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function resolveSkinTone(
  selected: SkinTone,
  recentlyUsed?: Exclude<SkinTone, "random">[]
): Exclude<SkinTone, "random"> {
  if (selected !== "random") return selected;

  // If we have recent usage data, pick the least-used tier
  if (recentlyUsed && recentlyUsed.length > 0) {
    const counts = new Map<string, number>();
    SKIN_TONE_TIERS.forEach((t) => counts.set(t, 0));
    recentlyUsed.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));

    const minCount = Math.min(...counts.values());
    const leastUsed = SKIN_TONE_TIERS.filter((t) => counts.get(t) === minCount);
    return pickRandom(leastUsed);
  }

  return pickRandom(SKIN_TONE_TIERS);
}

function resolveHairStyle(
  selected: HairStyle,
  recentlyUsed?: Exclude<HairStyle, "random">[]
): Exclude<HairStyle, "random"> {
  if (selected !== "random") return selected;

  if (recentlyUsed && recentlyUsed.length > 0) {
    const counts = new Map<string, number>();
    ALL_HAIR_STYLES.forEach((h) => counts.set(h, 0));
    recentlyUsed.forEach((h) => counts.set(h, (counts.get(h) || 0) + 1));

    const minCount = Math.min(...counts.values());
    const leastUsed = ALL_HAIR_STYLES.filter((h) => counts.get(h) === minCount);
    return pickRandom(leastUsed);
  }

  return pickRandom(ALL_HAIR_STYLES);
}

function resolveScene(
  selected: Scene,
  category: ContentCategory
): Exclude<Scene, "random"> {
  if (selected !== "random") return selected as Exclude<Scene, "random">;

  const availableScenes = SCENES_BY_CATEGORY[category].filter(
    (s): s is Exclude<Scene, "random"> => s !== "random"
  );
  return pickRandom(availableScenes.length > 0 ? availableScenes : ALL_SCENES);
}

function resolveVibe(selected: Vibe): Exclude<Vibe, "random"> {
  if (selected !== "random") return selected;
  return pickRandom(ALL_VIBES);
}

// ── Master Compose Function ───────────────────────────────────

/**
 * Composes the full prompt from selections + brand profile overrides.
 *
 * @param selections - User's form selections
 * @param options - Optional overrides and diversity data
 * @returns ComposedPrompt with full prompt and resolved random values
 */
export function composePrompt(
  selections: GenerationSelections,
  options?: {
    customBrandDNA?: string | null;
    customNegativePrompt?: string | null;
    recentSkinTones?: Exclude<SkinTone, "random">[];
    recentHairStyles?: Exclude<HairStyle, "random">[];
  }
): ComposedPrompt {
  // 1. Resolve all "random" selections
  const resolvedSkinTone = resolveSkinTone(
    selections.skinTone,
    options?.recentSkinTones
  );
  const resolvedHairStyle = resolveHairStyle(
    selections.hairStyle,
    options?.recentHairStyles
  );
  const resolvedScene = resolveScene(selections.scene, selections.category);
  const resolvedVibe = resolveVibe(selections.vibe);

  // 2. Build category-specific prompt
  let categoryPrompt: string;

  switch (selections.category) {
    case "lash-closeup":
      categoryPrompt = buildLashCloseupPrompt(selections, resolvedSkinTone);
      break;

    case "lifestyle":
      categoryPrompt = buildLifestylePrompt(
        selections,
        resolvedSkinTone,
        resolvedScene,
        resolvedVibe,
        resolvedHairStyle
      );
      break;

    case "product":
      categoryPrompt = buildProductPrompt(selections, resolvedScene);
      break;

    default:
      throw new Error(`Unknown category: ${selections.category}`);
  }

  // 3. Get Brand DNA and Negative Prompt (with optional custom overrides)
  const brandDNA = getBrandDNA(options?.customBrandDNA);

  // Use safe negative prompt for lifestyle (adds safety terms)
  const negativePrompt =
    selections.category === "lifestyle"
      ? getSafeNegativePrompt(options?.customNegativePrompt)
      : getNegativePrompt(options?.customNegativePrompt);

  // 4. Assemble the final prompt
  const fullPrompt = `${brandDNA}

${categoryPrompt}

[NEGATIVE / AVOID]:
${negativePrompt}`;

  return {
    fullPrompt,
    categoryPrompt,
    resolvedSelections: {
      skinTone: resolvedSkinTone,
      hairStyle: resolvedHairStyle,
      scene: resolvedScene,
      vibe: resolvedVibe,
    },
  };
}
