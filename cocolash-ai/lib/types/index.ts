/**
 * CocoLash AI — Type Definitions
 *
 * Central type system for the entire application.
 * Used across prompt engine, API routes, UI components, and database interactions.
 */

// ── Content Categories ────────────────────────────────────────
export type ContentCategory =
  | "lash-closeup"
  | "lifestyle"
  | "product"
  | "before-after"
  | "application-process";

// ── Application Process Steps (M2) ───────────────────────────
export type ApplicationStep =
  | "preparation"
  | "isolation"
  | "application"
  | "final-check"
  | "reveal";

// ── Composition ───────────────────────────────────────────────
export type Composition = "solo" | "duo" | "group";

// ── Group Shot Types (M2) ────────────────────────────────────
export type GroupAction =
  | "laughing"
  | "walking"
  | "posing"
  | "brunch"
  | "getting-ready";

export type AgeRange = "same" | "mixed" | "mature";

/** Per-person configuration in a group shot */
export interface GroupPersonConfig {
  skinTone: SkinTone;
  hairStyle: HairStyle;
}

/** Full group diversity selection from the form */
export interface GroupDiversitySelections {
  groupCount: 3 | 4 | 5;
  mode: "diverse-mix" | "custom"; // "diverse-mix" = auto-assign, "custom" = per-person
  people: GroupPersonConfig[]; // Only used when mode === "custom"
  ageRange: AgeRange;
  groupAction: GroupAction;
}

// ── Ethnicity (Upgrade 1 — Phase 1.10) ───────────────────────
export type Ethnicity =
  | "african-american"
  | "east-asian"
  | "south-asian"
  | "indian"
  | "latina"
  | "middle-eastern"
  | "caucasian"
  | "mixed"
  | "random";

// ── Solo/Duo Age Range (Upgrade 1 — Phase 1.10) ─────────────
export type SoloDuoAgeRange = "20s" | "30s" | "40s" | "50s-plus" | "random";

// ── Image Resolution ──────────────────────────────────────────
export type ImageResolution = "1K" | "2K" | "4K";

export interface ImageResolutionOption {
  value: ImageResolution;
  label: string;
  description: string;
}

export const IMAGE_RESOLUTION_OPTIONS: ImageResolutionOption[] = [
  { value: "1K", label: "1K", description: "Standard — fast & efficient" },
  { value: "2K", label: "2K", description: "High quality — sharper details" },
  { value: "4K", label: "4K", description: "Ultra HD — maximum detail" },
];

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
  sizePercent?: number;    // % of image width, default 22
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
  resolution: ImageResolution; // Image output resolution: "1K", "2K", or "4K"
  vibe: Vibe;
  logoOverlay: LogoOverlaySettings;
  contextNote?: string; // 100-char max optional note
  seasonal?: SeasonalSelection; // [M2] Seasonal/holiday preset
  groupDiversity?: GroupDiversitySelections; // [M2] Group shot diversity config
  applicationStep?: ApplicationStep; // [M2] Application Process step
  includeComposite?: boolean; // [M2] Before/After side-by-side composite toggle
  ethnicity?: Ethnicity; // [U1] Ethnicity selector
  ageRange?: SoloDuoAgeRange; // [U1] Age range for solo/duo
  /** HeyGen / video wizard assets saved into the image gallery */
  heygenAsset?: {
    kind: "ugc-avatar" | "heygen-composition" | "studio-avatar";
    personImageUrl?: string;
    productImageUrl?: string;
    pose?: CompositionPose;
  };
}

// ── Generated Image (database record) ─────────────────────────
export interface GeneratedImage {
  id: string;
  brand_id: string;
  user_id: string | null;
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
  seasonal_preset_id: string | null;
  group_count: number | null;
  diversity_selections: GroupDiversitySelections | null;
  is_composite: boolean;
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

// ── Saved Prompt Template (database record) ───────────────────
export interface SavedPrompt {
  id: string;
  brand_id: string;
  user_id: string | null;
  name: string;
  selections: GenerationSelections;
  category: ContentCategory;
  thumbnail_url: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
}

// ── API Response Types ────────────────────────────────────────
export interface GenerateResponse {
  success: boolean;
  image: GeneratedImage;
  generationTimeMs: number;
  /** Before/After dual-image generation returns a second image */
  beforeImage?: GeneratedImage;
  /** Before/After composite side-by-side image URL (when includeComposite is true) */
  compositeImageUrl?: string;
  /** Full composite image record for gallery display */
  compositeImage?: GeneratedImage;
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

// ═══════════════════════════════════════════════════════════════
// UPGRADE 1 — System 1: AI Caption & Publishing Engine
// ═══════════════════════════════════════════════════════════════

// ── Caption Styles ────────────────────────────────────────────
export type CaptionStyle =
  | "casual"
  | "professional"
  | "promotional"
  | "storytelling"
  | "question";

// ── Social Platforms ──────────────────────────────────────────
export type Platform =
  | "instagram"
  | "tiktok"
  | "twitter"
  | "facebook"
  | "linkedin";

// ── Post Status ───────────────────────────────────────────────
export type PostStatus = "draft" | "scheduled" | "published" | "failed";

// ── Hashtag (database record) ─────────────────────────────────
export interface Hashtag {
  id: string;
  tag: string;
  category: string;
  sub_category: string | null;
  platform: Platform[];
  popularity_score: number;
  is_branded: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Caption (database record) ─────────────────────────────────
export interface Caption {
  id: string;
  image_id: string;
  platform: Platform;
  caption_text: string;
  caption_style: CaptionStyle;
  hashtags: string[];
  character_count: number;
  generated_at: string;
  is_selected: boolean;
}

// ── Scheduled Post (database record) ──────────────────────────
export interface ScheduledPost {
  id: string;
  image_id: string;
  caption_id: string | null;
  platform: Platform;
  blotato_post_id: string | null;
  blotato_account_id: string | null;
  status: PostStatus;
  scheduled_time: string | null;
  published_time: string | null;
  error_message: string | null;
  created_at: string;
}

// ── Social Account (database record) ──────────────────────────
export interface SocialAccount {
  id: string;
  blotato_account_id: string;
  platform: Platform;
  account_name: string | null;
  account_handle: string | null;
  profile_image_url: string | null;
  is_active: boolean;
  last_synced_at: string;
}

// ── Caption Settings (database record) ────────────────────────
export interface CaptionSettings {
  id: string;
  brand_voice_prompt: string | null;
  default_style: CaptionStyle;
  always_include_hashtags: string[];
  never_include_hashtags: string[];
  default_cta: string | null;
  blotato_api_key: string | null;
  updated_at: string;
}

// ── Caption Generation API Types ──────────────────────────────

export interface CaptionGenerateRequest {
  imageId: string;
  style: CaptionStyle;
  platforms: Platform[];
  customNote?: string;
}

export interface CaptionVariation {
  text: string;
  style_match: number;
  hashtags: string[];
  character_count: number;
  is_within_limit: boolean;
}

export interface CaptionPlatformResult {
  platform: Platform;
  captions: CaptionVariation[];
}

export interface CaptionGenerateResponse {
  success: boolean;
  results: CaptionPlatformResult[];
}

/** Context derived from a generated image's selections, used for caption/hashtag generation */
export interface ImageContext {
  category: ContentCategory;
  lashStyle: LashStyle;
  vibe: Vibe;
  scene: Scene;
  skinTone: SkinTone;
  seasonal: string | null;
  composition: Composition;
  productSubCategory?: ProductCategoryKey;
}

// ═══════════════════════════════════════════════════════════════
// UPGRADE 1 — System 2: AI UGC Video Creator
// ═══════════════════════════════════════════════════════════════

// ── Campaign Types ────────────────────────────────────────────
export type CampaignType =
  | "product-showcase"
  | "testimonial"
  | "promo"
  | "educational"
  | "unboxing"
  | "before-after"
  | "brand-story"
  | "faq"
  | "myths"
  | "product-knowledge";

// ── Script Tone ───────────────────────────────────────────────
export type ScriptTone = "casual" | "energetic" | "calm" | "professional";

// ── Video Duration (seconds) ──────────────────────────────────
export type VideoDuration = 15 | 30 | 60 | 90;

// ── Video Aspect Ratio ────────────────────────────────────────
export type VideoAspectRatio = "9:16" | "1:1" | "16:9";

// ── Composition Pose (person + product) ───────────────────────
export type CompositionPose = "holding" | "applying" | "selfie" | "testimonial";

// ── Video Pipeline ────────────────────────────────────────────
export type VideoPipeline = "heygen" | "seedance";

// ── HeyGen Video Status ──────────────────────────────────────
// `captioning` is an intermediate state we set AFTER HeyGen returns
// `completed` but BEFORE Shotstack has finished burning captions. It
// acts as a lock so that parallel status polls don't each spawn a new
// Shotstack render.
export type HeyGenVideoStatus =
  | "pending"
  | "processing"
  | "captioning"
  | "completed"
  | "failed";

// ── Video Background Type ────────────────────────────────────
export type VideoBackgroundType = "solid" | "gradient" | "image";

// ── Video Script (database record) ────────────────────────────
export interface VideoScript {
  id: string;
  title: string | null;
  campaign_type: CampaignType;
  tone: ScriptTone;
  duration_seconds: number;
  script_text: string;
  hook_text: string | null;
  cta_text: string | null;
  is_template: boolean;
  created_at: string;
}

// ── Generated Video (database record) ─────────────────────────
export interface GeneratedVideo {
  id: string;
  script_id: string | null;
  person_image_id: string | null;
  person_image_url: string | null;
  product_image_url: string | null;
  composed_image_url: string | null;
  avatar_image_url: string | null;
  heygen_video_id: string | null;
  heygen_status: HeyGenVideoStatus | null;
  raw_video_url: string | null;
  final_video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  aspect_ratio: VideoAspectRatio | null;
  has_captions: boolean;
  has_watermark: boolean;
  has_background_music: boolean;
  voice_id: string | null;
  background_type: VideoBackgroundType | CampaignType | string | null;
  background_value: string | null;
  processing_cost: number | null;
  pipeline: VideoPipeline;
  seedance_task_id: string | null;
  seedance_prompt: string | null;
  audio_mode: string | null;
  audio_url: string | null;
  script_text_cache: string | null;
  caption_srt: string | null;
  created_at: string;
  completed_at: string | null;
}

// ── Voice Option (database record — cached from voice provider) ─
export interface VoiceOption {
  id: string;
  name: string | null;
  gender: string | null;
  accent: string | null;
  tone: string | null;
  preview_url: string | null;
  is_active: boolean;
  age?: string | null;
  descriptive?: string | null;
  use_case?: string | null;
  provider?: "elevenlabs" | "heygen";
}

// ── Background Music (database record) ────────────────────────
export interface BackgroundMusic {
  id: string;
  name: string | null;
  category: string | null;
  duration_seconds: number | null;
  file_url: string;
  is_active: boolean;
}

// ── Video Generation API Types ────────────────────────────────

export interface VideoGenerateRequest {
  scriptId?: string;
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: VideoDuration;
  personImageId?: string;
  personImageUrl?: string;
  productImageUrl?: string;
  pose?: CompositionPose;
  voiceId: string;
  aspectRatio: VideoAspectRatio;
  /** When set, skip Gemini compose and use this image for HeyGen photo avatar */
  composedImageUrl?: string;
}

export interface VideoGenerateResponse {
  success: boolean;
  videoId: string;
  status: HeyGenVideoStatus;
  estimatedTime: string;
}

export interface VideoStatusResponse {
  videoId: string;
  status: HeyGenVideoStatus;
  progress?: number;
  finalVideoUrl?: string;
  thumbnailUrl?: string;
  captionSrt?: string;
  scriptTextCache?: string;
  durationSeconds?: number;
  error?: string;
}

export interface ScriptResult {
  hook: string;
  body: string;
  cta: string;
  full_script: string;
  estimated_duration: number;
  style_match: number;
}

// ── Caption Burn Method ───────────────────────────────────────
export type CaptionMethod = "shotstack" | "heygen" | "cloudinary-srt" | "none";

// ── Processed Video (post-pipeline result) ───────────────────
export interface ProcessedVideo {
  cloudinaryPublicId: string;
  videoUrl: string;
  thumbnailUrl: string;
  watermarkedUrl: string | null;
  captionedUrl: string | null;
  srtPublicId: string | null;
  duration: number;
  width: number;
  height: number;
  format: string;
  captionMethod?: CaptionMethod;
}
