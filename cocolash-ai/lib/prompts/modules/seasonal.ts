/**
 * CocoLash Seasonal / Holiday Presets
 *
 * 15+ presets organized into three categories:
 *   - Major Holidays (Valentine's Day, Mother's Day, Halloween, Christmas, New Year's Eve)
 *   - Beauty Industry Events (National Lash Day, Galentine's Day, Self-Care Sunday, World Lash Day)
 *   - Seasonal Themes (Wedding Season, Prom Season, Back to School, Summer Vibes, Holiday Party, Fall/Autumn)
 *
 * Each preset includes:
 *   - A prompt modifier block injected between the category template and negative prompt
 *   - Suggested props (toggleable in UI)
 *   - Mood keywords for the AI
 *   - Available months (for filtering in the UI)
 *   - Optional color overrides to shift the palette for the season
 */

import type { SeasonalPresetCategory, SeasonalPresetDefinition } from "@/lib/types";

// ── Seasonal Preset Definitions ───────────────────────────────

export const SEASONAL_PRESETS: SeasonalPresetDefinition[] = [
  // ────────────────────────────────────────────────────────────
  //  MAJOR HOLIDAYS
  // ────────────────────────────────────────────────────────────
  {
    name: "Valentine's Day",
    slug: "valentines-day",
    category: "major_holiday",
    promptModifier: `[SEASONAL CONTEXT: VALENTINE'S DAY]
Romantic Valentine's Day atmosphere. Incorporate soft pinks, deep reds, and rose gold tones into the scene.
Warm candlelit or golden hour glow. Subtle heart motifs in the background or accessories.
Mood: deeply romantic, feminine allure, confident love. The model radiates self-love and sensuality.
Think: luxurious date night ready, "I am the Valentine" energy.`,
    colorOverrides: {
      accent: "#c92a42", // Deep rose red
      background: "#f8e1e8", // Soft blush pink
    },
    props: [
      "red roses",
      "heart-shaped accessories",
      "silk/satin fabric",
      "candlelight",
      "champagne glass",
      "rose petals",
    ],
    moodKeywords: ["romantic", "sensual", "self-love", "date-night", "alluring"],
    availableMonths: [1, 2], // January–February
    sortOrder: 1,
  },
  {
    name: "Mother's Day",
    slug: "mothers-day",
    category: "major_holiday",
    promptModifier: `[SEASONAL CONTEXT: MOTHER'S DAY]
Warm, nurturing Mother's Day setting. Soft natural light, fresh flowers (peonies, orchids, or hydrangeas).
Pastel tones with warm undertones — cream, lavender, soft coral. Elegant but approachable.
Mood: graceful, proud, nurturing radiance. Celebrating the beauty of motherhood.
Think: brunch-ready queen, effortlessly put-together, warmth that glows from within.`,
    colorOverrides: {
      accent: "#d4a0b9", // Soft mauve
      background: "#faf5f0", // Warm cream
    },
    props: [
      "fresh flowers",
      "brunch setting",
      "gift box",
      "pearls",
      "pastel accessories",
      "garden backdrop",
    ],
    moodKeywords: ["nurturing", "graceful", "elegant", "warm", "radiant"],
    availableMonths: [4, 5], // April–May
    sortOrder: 2,
  },
  {
    name: "Halloween",
    slug: "halloween",
    category: "major_holiday",
    promptModifier: `[SEASONAL CONTEXT: HALLOWEEN GLAM]
Glamorous Halloween-inspired beauty — NOT scary or gory. Think "elevated costume party."
Rich, moody color palette: deep plum, burnt orange, midnight black with gold accents.
Dramatic smoky eye makeup complementing the CocoLash extensions. Luxurious dark aesthetic.
Mood: mysteriously glamorous, bold and bewitching, fierce confidence.
Think: the best-dressed at the Halloween gala, beauty that casts a spell.`,
    colorOverrides: {
      accent: "#8B4513", // Burnt orange-brown
      background: "#1a1a2e", // Deep midnight
    },
    props: [
      "dramatic smoky eye",
      "black lace",
      "gold jewelry",
      "dark florals",
      "velvet fabric",
      "moonlight ambiance",
    ],
    moodKeywords: ["mysterious", "glamorous", "bold", "bewitching", "dramatic"],
    availableMonths: [9, 10], // September–October
    sortOrder: 3,
  },
  {
    name: "Christmas",
    slug: "christmas",
    category: "major_holiday",
    promptModifier: `[SEASONAL CONTEXT: CHRISTMAS / HOLIDAY SEASON]
Luxurious Christmas holiday atmosphere. Rich jewel tones — emerald green, ruby red, champagne gold.
Warm ambient lighting, bokeh from fairy lights or Christmas tree lights in the background.
Festive sparkle in accessories or clothing without being tacky. Elevated holiday elegance.
Mood: festive glamour, joyful confidence, holiday queen energy.
Think: the stunning guest who lights up every holiday party.`,
    colorOverrides: {
      accent: "#c9a043", // Champagne gold
      background: "#0f3d0f", // Deep emerald
    },
    props: [
      "fairy lights bokeh",
      "gold/emerald accessories",
      "velvet fabric",
      "sparkle details",
      "gift wrapping",
      "Christmas tree backdrop",
    ],
    moodKeywords: ["festive", "glamorous", "joyful", "sparkling", "luxurious"],
    availableMonths: [11, 12], // November–December
    sortOrder: 4,
  },
  {
    name: "New Year's Eve",
    slug: "new-years-eve",
    category: "major_holiday",
    promptModifier: `[SEASONAL CONTEXT: NEW YEAR'S EVE]
Dazzling New Year's Eve celebration. Black and gold color scheme with champagne sparkle.
Sequins, metallic accents, dramatic lighting. Confetti or glitter subtly in the scene.
Full glam makeup look — bold lip, dramatic lashes are the star. Luxurious party setting.
Mood: show-stopping, unapologetically glamorous, "main character entering the new year."
Think: the countdown moment, all eyes on her, champagne toast ready.`,
    colorOverrides: {
      accent: "#ffd700", // Gold
      background: "#0d0d0d", // Deep black
    },
    props: [
      "champagne glass/bottle",
      "sequin/metallic dress",
      "confetti",
      "sparklers",
      "gold accessories",
      "party lighting",
    ],
    moodKeywords: ["dazzling", "show-stopping", "glamorous", "celebratory", "bold"],
    availableMonths: [12, 1], // December–January
    sortOrder: 5,
  },

  // ────────────────────────────────────────────────────────────
  //  BEAUTY INDUSTRY EVENTS
  // ────────────────────────────────────────────────────────────
  {
    name: "National Lash Day",
    slug: "national-lash-day",
    category: "beauty_industry",
    promptModifier: `[SEASONAL CONTEXT: NATIONAL LASH DAY]
Celebration of lash artistry and beauty. Ultra-close focus on the lashes — every fiber, every curl.
Studio-quality beauty lighting that makes the lash extensions look like art.
Highlight the craftsmanship: precise application, perfect symmetry, individual fiber detail.
Mood: artistic pride, professional mastery, "these lashes are a masterpiece."
Think: the ultimate lash showcase day, beauty editorial level detail.`,
    colorOverrides: null,
    props: [
      "extreme lash close-up",
      "lash tools",
      "beauty ring light",
      "mirror reflection",
      "lash palette",
      "precision tools",
    ],
    moodKeywords: ["artistic", "precise", "masterful", "celebratory", "detailed"],
    availableMonths: [2], // February 19
    sortOrder: 6,
  },
  {
    name: "Galentine's Day",
    slug: "galentines-day",
    category: "beauty_industry",
    promptModifier: `[SEASONAL CONTEXT: GALENTINE'S DAY]
Celebrating female friendship and sisterhood. Warm, fun, empowering group energy.
Pink and lavender palette with playful gold accents. Brunch or girls' night out setting.
Multiple women celebrating together, diverse group of African-American women supporting each other.
Mood: empowering friendship, joy, "girls supporting girls," sisterhood celebration.
Think: the ultimate girls' day out — pampered, gorgeous, and loving every minute.`,
    colorOverrides: {
      accent: "#e6739f", // Playful pink
      background: "#f5e6f0", // Soft lavender
    },
    props: [
      "matching accessories",
      "brunch table",
      "pink decorations",
      "friendship bracelets",
      "cocktails",
      "photo props",
    ],
    moodKeywords: ["empowering", "joyful", "sisterhood", "fun", "supportive"],
    availableMonths: [2], // February 13
    sortOrder: 7,
  },
  {
    name: "Self-Care Sunday",
    slug: "self-care-sunday",
    category: "beauty_industry",
    promptModifier: `[SEASONAL CONTEXT: SELF-CARE SUNDAY]
Peaceful self-care ritual atmosphere. Soft, natural morning/afternoon light filtering through sheer curtains.
Spa-like setting with soft textures — plush robe, clean towels, natural skincare products.
Minimal, clean aesthetic. Focus on the beauty routine including lash care and maintenance.
Mood: serene, nourished, intentional self-love, "this is my time" energy.
Think: Sunday morning glow-up ritual, the art of taking care of yourself.`,
    colorOverrides: {
      accent: "#a8d8c4", // Spa green
      background: "#faf9f6", // Clean white
    },
    props: [
      "plush robe",
      "skincare products",
      "candles",
      "fresh towels",
      "face mask",
      "herbal tea",
    ],
    moodKeywords: ["serene", "peaceful", "nourished", "intentional", "glowing"],
    availableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // Year-round
    sortOrder: 8,
  },
  {
    name: "World Lash Day",
    slug: "world-lash-day",
    category: "beauty_industry",
    promptModifier: `[SEASONAL CONTEXT: WORLD LASH DAY]
Global celebration of lash beauty and artistry. Editorial-quality beauty photography.
Dramatic, impactful lighting that emphasizes lash volume, length, and curl.
The lashes are the absolute hero of the image — every other element supports the lash story.
Mood: iconic, editorial, "the lashes that stop traffic," worldwide beauty celebration.
Think: cover of a beauty magazine dedicated to lash artistry.`,
    colorOverrides: null,
    props: [
      "editorial lighting",
      "beauty magazine aesthetic",
      "dramatic eye makeup",
      "reflective surfaces",
      "professional studio",
      "beauty tools display",
    ],
    moodKeywords: ["editorial", "iconic", "dramatic", "impactful", "celebratory"],
    availableMonths: [3], // March
    sortOrder: 9,
  },

  // ────────────────────────────────────────────────────────────
  //  SEASONAL THEMES
  // ────────────────────────────────────────────────────────────
  {
    name: "Wedding Season",
    slug: "wedding-season",
    category: "seasonal",
    promptModifier: `[SEASONAL CONTEXT: WEDDING SEASON]
Bridal and wedding beauty inspiration. Soft, romantic lighting with floral elements.
Elegant, timeless aesthetic — white, ivory, champagne, and blush tones.
Lashes styled for bridal perfection — enhancing natural beauty for the big day.
Mood: bridal elegance, timeless beauty, "she's ready for the aisle" radiance.
Think: wedding day glam — the bride, bridesmaid, or wedding guest who turns every head.`,
    colorOverrides: {
      accent: "#d4c5a9", // Champagne
      background: "#fff8f0", // Ivory
    },
    props: [
      "floral arrangements",
      "veil/headpiece",
      "pearl jewelry",
      "champagne tones",
      "soft tulle",
      "bridal bouquet",
    ],
    moodKeywords: ["bridal", "elegant", "timeless", "romantic", "radiant"],
    availableMonths: [5, 6, 7, 8, 9], // May–September
    sortOrder: 10,
  },
  {
    name: "Prom Season",
    slug: "prom-season",
    category: "seasonal",
    promptModifier: `[SEASONAL CONTEXT: PROM SEASON]
Youthful prom glamour with a sophisticated edge. Vibrant jewel tones — sapphire, emerald, magenta.
Sparkle and shimmer in accessories and attire. Professional makeup artistry on young women.
The lashes complete the "getting ready" transformation — from everyday to prom queen.
Mood: youthful excitement, glamorous transformation, "prom queen energy."
Think: the getting-ready moment, seeing herself all glammed up for the first time.`,
    colorOverrides: {
      accent: "#7b2d8e", // Jewel purple
      background: "#1a1a3e", // Deep sapphire
    },
    props: [
      "sparkly dress",
      "corsage",
      "updo hairstyle",
      "statement jewelry",
      "getting-ready mirror",
      "makeup station",
    ],
    moodKeywords: ["youthful", "glamorous", "exciting", "sparkling", "transformative"],
    availableMonths: [3, 4, 5, 6], // March–June
    sortOrder: 11,
  },
  {
    name: "Back to School",
    slug: "back-to-school",
    category: "seasonal",
    promptModifier: `[SEASONAL CONTEXT: BACK TO SCHOOL]
Fresh, polished "first day" beauty look. Clean, approachable, and age-appropriate.
Natural-enhanced lashes that are stunning but practical for everyday wear.
Bright, clean aesthetic with warm earth tones and pops of color.
Mood: fresh start energy, confident and ready, effortlessly beautiful for everyday.
Think: the girl who always looks put together — her lashes are her secret weapon.`,
    colorOverrides: {
      accent: "#e07c4c", // Warm terracotta
      background: "#f5f0e8", // Soft khaki
    },
    props: [
      "clean/polished look",
      "natural makeup",
      "structured bag",
      "warm earth tones",
      "casual chic outfit",
      "coffee cup",
    ],
    moodKeywords: ["fresh", "polished", "confident", "everyday", "effortless"],
    availableMonths: [7, 8, 9], // July–September
    sortOrder: 12,
  },
  {
    name: "Summer Vibes",
    slug: "summer-vibes",
    category: "seasonal",
    promptModifier: `[SEASONAL CONTEXT: SUMMER VIBES]
Sun-kissed summer beauty. Golden hour lighting, warm glow on melanin-rich skin.
Vibrant, tropical-inspired palette — coral, turquoise, mango, sunset orange.
Dewy, glowing skin. Lashes that hold up in the heat — waterproof glam.
Mood: carefree summer energy, sun-kissed goddess, "hot girl summer."
Think: poolside, beach vacation, rooftop sundowner — effortlessly gorgeous in the heat.`,
    colorOverrides: {
      accent: "#ff7f50", // Coral
      background: "#fff5e6", // Warm sunset
    },
    props: [
      "sunglasses",
      "sun hat",
      "tropical setting",
      "pool/beach backdrop",
      "citrus props",
      "flowy summer dress",
    ],
    moodKeywords: ["sun-kissed", "carefree", "vibrant", "glowing", "tropical"],
    availableMonths: [5, 6, 7, 8], // May–August
    sortOrder: 13,
  },
  {
    name: "Holiday Party",
    slug: "holiday-party",
    category: "seasonal",
    promptModifier: `[SEASONAL CONTEXT: HOLIDAY PARTY]
Festive holiday party glamour. Rich, warm tones — burgundy, forest green, gold, copper.
Party lighting with warm ambient glow. Cocktail party or dinner setting.
Full glam makeup with statement lashes as the centerpiece of the look.
Mood: festive and fabulous, holiday hostess energy, dressed to impress.
Think: the office holiday party, the family gathering, the friendsgiving — she's the best-dressed.`,
    colorOverrides: {
      accent: "#8b1a3a", // Burgundy
      background: "#1a2a1a", // Deep forest
    },
    props: [
      "cocktail glass",
      "festive lighting",
      "statement earrings",
      "velvet dress",
      "party decor",
      "warm candles",
    ],
    moodKeywords: ["festive", "fabulous", "sophisticated", "party-ready", "dazzling"],
    availableMonths: [11, 12], // November–December
    sortOrder: 14,
  },
  {
    name: "Fall / Autumn",
    slug: "fall-autumn",
    category: "seasonal",
    promptModifier: `[SEASONAL CONTEXT: FALL / AUTUMN]
Rich autumn aesthetic. Warm, earthy color palette — burnt sienna, rust, deep olive, amber, camel.
Soft diffused light through autumn leaves. Cozy textures — knits, leather, suede, wool.
Makeup in warm tones that complement African-American skin beautifully. Lashes enhance the cozy glam.
Mood: warm and cozy sophistication, "sweater weather gorgeous," fall fashion editorial.
Think: pumpkin spice and everything nice — but make it luxury.`,
    colorOverrides: {
      accent: "#bf5b3d", // Burnt sienna
      background: "#f0e6d4", // Warm amber cream
    },
    props: [
      "autumn leaves",
      "cozy knit/sweater",
      "warm drink",
      "leather accessories",
      "earth tone palette",
      "outdoor fall setting",
    ],
    moodKeywords: ["cozy", "warm", "sophisticated", "autumnal", "earthy"],
    availableMonths: [9, 10, 11], // September–November
    sortOrder: 15,
  },
];

// ── Helper Functions ──────────────────────────────────────────

/**
 * Get all presets, optionally filtered to the current month.
 */
export function getSeasonalPresets(currentMonthOnly = false): SeasonalPresetDefinition[] {
  if (!currentMonthOnly) return SEASONAL_PRESETS;

  const currentMonth = new Date().getMonth() + 1; // 1-based
  return SEASONAL_PRESETS.filter((p) => p.availableMonths.includes(currentMonth));
}

/**
 * Get presets grouped by category.
 */
export function getPresetsGroupedByCategory(
  currentMonthOnly = false
): Record<SeasonalPresetCategory, SeasonalPresetDefinition[]> {
  const presets = getSeasonalPresets(currentMonthOnly);

  const grouped: Record<SeasonalPresetCategory, SeasonalPresetDefinition[]> = {
    major_holiday: [],
    beauty_industry: [],
    seasonal: [],
  };

  for (const preset of presets) {
    grouped[preset.category].push(preset);
  }

  return grouped;
}

/**
 * Find a preset by its slug.
 */
export function getPresetBySlug(slug: string): SeasonalPresetDefinition | undefined {
  return SEASONAL_PRESETS.find((p) => p.slug === slug);
}

/**
 * Build the seasonal prompt modifier section from a preset + selected props.
 * This gets injected between the category template and the negative prompt.
 */
export function buildSeasonalPromptModifier(
  preset: SeasonalPresetDefinition,
  selectedProps?: string[]
): string {
  let modifier = preset.promptModifier;

  // Add selected props if any
  if (selectedProps && selectedProps.length > 0) {
    modifier += `\n\nIncorporate these seasonal props/elements naturally into the scene: ${selectedProps.join(", ")}.`;
  }

  // Add mood keywords
  modifier += `\nOverall seasonal mood: ${preset.moodKeywords.join(", ")}.`;

  return modifier;
}

/**
 * Category display labels for UI grouping.
 */
export const SEASONAL_CATEGORY_LABELS: Record<SeasonalPresetCategory, string> = {
  major_holiday: "Major Holidays",
  beauty_industry: "Beauty Industry Events",
  seasonal: "Seasonal Themes",
};
