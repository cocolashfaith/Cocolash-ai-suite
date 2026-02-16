/**
 * CocoLash AI — Type Definitions
 *
 * Central type system for the entire application.
 * Used across prompt engine, API routes, UI components, and database interactions.
 */

// ── Content Categories ────────────────────────────────────────
/** M1 categories. M2 adds "before-after" and "application-process". */
export type ContentCategory =
  | "lash-closeup"
  | "lifestyle"
  | "product";

/** All categories including M2 additions. */
export type ContentCategoryAll =
  | ContentCategory
  | "before-after"
  | "application-process";

// ── Composition ───────────────────────────────────────────────
/** M1 compositions. M2 adds "group". */
export type Composition = "solo" | "duo";

export type CompositionAll = Composition | "group";

// ── Aspect Ratios ─────────────────────────────────────────────
export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export interface AspectRatioOption {
  value: AspectRatio;
  label: string;
  platform: string;
  width: number;
  height: number;
}

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  { value: "1:1", label: "Square", platform: "Instagram Feed", width: 1024, height: 1024 },
  { value: "4:5", label: "Portrait", platform: "Instagram Optimal", width: 1024, height: 1280 },
  { value: "9:16", label: "Vertical", platform: "Stories / Reels / TikTok", width: 768, height: 1365 },
  { value: "16:9", label: "Landscape", platform: "Facebook Cover / YouTube", width: 1365, height: 768 },
];

// ── Skin Tones (Monk Skin Tone Scale) ─────────────────────────
export type SkinTone = "deep" | "medium-deep" | "medium" | "light" | "random";

export interface SkinToneOption {
  value: SkinTone;
  label: string;
  swatchColor: string;
}

// ── Lash Styles ───────────────────────────────────────────────
export type LashStyle =
  | "natural"
  | "volume"
  | "dramatic"
  | "cat-eye"
  | "wispy"
  | "doll-eye"
  | "hybrid"
  | "mega-volume";

// ── Hair Styles ───────────────────────────────────────────────
export type HairStyleGroup = "natural" | "protective" | "styled";

export type HairStyle =
  // Natural
  | "4c-natural"
  | "afro"
  | "twist-out"
  | "blown-out"
  // Protective
  | "box-braids"
  | "locs"
  | "sew-in"
  | "cornrows"
  | "bantu-knots"
  // Styled
  | "silk-press"
  | "loose-waves"
  | "short-tapered"
  | "random";

export interface HairStyleOption {
  value: HairStyle;
  label: string;
  group: HairStyleGroup | "random";
}

// ── Scenes / Environments ─────────────────────────────────────
export type Scene =
  | "studio"
  | "bedroom"
  | "cafe"
  | "outdoor-golden-hour"
  | "rooftop"
  | "salon"
  | "bathroom-vanity"
  | "minimalist-backdrop"
  | "random";

// ── Vibes / Moods ─────────────────────────────────────────────
export type Vibe =
  | "confident-glam"
  | "soft-romantic"
  | "bold-editorial"
  | "natural-beauty"
  | "night-out"
  | "self-care"
  | "professional"
  | "random";

// ── Logo Overlay ──────────────────────────────────────────────
export type LogoPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export type LogoVariant = "white" | "dark" | "gold";

export interface LogoOverlaySettings {
  enabled: boolean;
  position: LogoPosition;
  variant: LogoVariant;
  opacity?: number;       // 0-1, default 0.9
  paddingPercent?: number; // % from edge, default 4
  sizePercent?: number;    // % of image width, default 15
}

// ── Seasonal / Holiday Presets ────────────────────────────────
export type SeasonalPresetCategory = "major_holiday" | "beauty_industry" | "seasonal";

export interface SeasonalPresetDefinition {
  name: string;
  slug: string;
  category: SeasonalPresetCategory;
  promptModifier: string;
  colorOverrides: { accent: string; background: string } | null;
  props: string[];
  moodKeywords: string[];
  availableMonths: number[]; // 1-12
  sortOrder: number;
}

/** DB record shape for seasonal_presets table */
export interface SeasonalPreset {
  id: string;
  name: string;
  slug: string;
  category: string;
  prompt_modifier: string;
  color_overrides: { accent: string; background: string } | null;
  props: string[];
  mood_keywords: string[];
  available_months: number[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

/** What the user selects on the form (seasonal portion) */
export interface SeasonalSelection {
  presetSlug: string | null;      // null = "No Season"
  selectedProps: string[];        // Which of the preset's props the user toggled on
}

// ── Product Sub-Categories ────────────────────────────────────
export type ProductCategoryKey =
  | "single-black-tray"
  | "single-nude-tray"
  | "multi-lash-book"
  | "full-kit-pouch"
  | "full-kit-box"
  | "storage-pouch"
  | "branding-flatlay";

export interface ProductCategory {
  id: string;
  key: ProductCategoryKey;
  label: string;
  description: string | null;
  prompt_template: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductReferenceImage {
  id: string;
  category_id: string;
  image_url: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
}

// ── Generation Selections (the full form state) ───────────────
export interface GenerationSelections {
  category: ContentCategory;
  productSubCategory?: ProductCategoryKey; // Only when category === "product"
  skinTone: SkinTone;
  lashStyle: LashStyle;
  hairStyle: HairStyle;
  scene: Scene;
  composition: Composition;
  aspectRatio: AspectRatio;
  vibe: Vibe;
  logoOverlay: LogoOverlaySettings;
  contextNote?: string; // 100-char max optional note
  seasonal?: SeasonalSelection; // [M2] Seasonal/holiday preset
}

// ── Generated Image (database record) ─────────────────────────
export interface GeneratedImage {
  id: string;
  brand_id: string;
  prompt_used: string;
  selections: GenerationSelections;
  image_url: string;
  raw_image_url: string | null;
  storage_path: string;
  aspect_ratio: AspectRatio;
  category: ContentCategory;
  composition: Composition;
  has_logo_overlay: boolean;
  logo_position: LogoPosition | null;
  generation_time_ms: number | null;
  gemini_model: string;
  is_favorite: boolean;
  tags: string[] | null;
  seasonal_preset_id: string | null; // [M2] Reference to seasonal_presets
  created_at: string;
}

// ── Brand Profile (database record) ───────────────────────────
export interface BrandProfile {
  id: string;
  name: string;
  color_palette: {
    primary: Record<string, { hex: string; label: string }>;
    secondary: Record<string, { hex: string; label: string }>;
    accents: Record<string, { hex: string; label: string }>;
    rule: string;
  };
  tone_keywords: string[];
  brand_dna_prompt: string;
  negative_prompt: string;
  skin_realism_prompt: string | null;
  logo_white_url: string | null;
  logo_dark_url: string | null;
  logo_gold_url: string | null;
  product_image_urls: string[];
  created_at: string;
  updated_at: string;
}

// ── API Response Types ────────────────────────────────────────
export interface GenerateResponse {
  success: boolean;
  image: GeneratedImage;
  generationTimeMs: number;
}

export interface GenerateErrorResponse {
  error: string;
  code?: "SAFETY_BLOCK" | "RATE_LIMITED" | "EMPTY_RESPONSE" | "NO_IMAGE_DATA" | "TIMEOUT" | "INVALID_API_KEY" | "MODEL_ERROR" | "UNKNOWN";
  retryAfterMs?: number;
}

// ── Prompt Descriptor Function Type ───────────────────────────
export type DescriptorFn<T extends string> = (key: T) => string;

// ── Diversity Tracker Record ──────────────────────────────────
export interface DiversityRecord {
  id: string;
  brand_id: string;
  skin_tone: SkinTone;
  hair_style: HairStyle;
  age_range: string | null;
  used_at: string;
}
