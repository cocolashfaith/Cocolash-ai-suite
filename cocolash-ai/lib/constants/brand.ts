/**
 * CocoLash Brand Constants
 *
 * Central source of truth for all brand-related values.
 * Used across the UI, prompts, and image processing pipeline.
 */

// ── Brand Colors ──────────────────────────────────────────────
export const BRAND_COLORS = {
  primary: {
    softPink: { hex: "#ead1c1", label: "Soft Pink" },
    creamyBeige: { hex: "#ede5d6", label: "Creamy Beige" },
  },
  secondary: {
    warmDarkBrown: { hex: "#28150e", label: "Warm Dark Brown" },
    goldenBrown: { hex: "#ce9765", label: "Golden Brown" },
  },
  accents: {
    charcoal: { hex: "#242424", label: "Charcoal" },
    cleanWhite: { hex: "#ffffff", label: "Clean White" },
  },
} as const;

/**
 * Flat array of all brand colors for palette display.
 *
 * Roles are dominant / supporting / accent — intentionally NOT labelled with
 * rigid "60% / 30% / 10%" percentages. Faith's feedback (2026-05) was that the
 * hard 60-30-10 framing "doesn't add up"; the percentages are loose guidelines,
 * not a math rule, so the UI shows the role only.
 */
export const BRAND_PALETTE = [
  { hex: "#ead1c1", label: "Soft Pink", category: "Dominant" },
  { hex: "#ede5d6", label: "Creamy Beige", category: "Dominant" },
  { hex: "#28150e", label: "Warm Dark Brown", category: "Supporting" },
  { hex: "#ce9765", label: "Golden Brown", category: "Supporting" },
  { hex: "#242424", label: "Charcoal", category: "Accent" },
  { hex: "#ffffff", label: "Clean White", category: "Accent" },
] as const;

// ── Brand Keywords ────────────────────────────────────────────
export const DEFAULT_TONE_KEYWORDS = [
  "luxury",
  "feminine",
  "elegant",
  "modern",
  "clean",
  "confident",
  "warm",
  "approachable",
] as const;

// ── Brand Identity ────────────────────────────────────────────
export const BRAND_NAME = "CocoLash";
export const BRAND_TAGLINE = "Premium Luxury Lash Brand";
export const BRAND_AUDIENCE =
  "African American women who embrace both understated elegance and unapologetic confidence";

// ── Logo Variants ─────────────────────────────────────────────
export const LOGO_VARIANTS = [
  { key: "white", label: "Light Pink Logo", description: "For dark backgrounds" },
  { key: "dark", label: "Dark Logo", description: "For light backgrounds" },
  { key: "gold", label: "Beige Logo", description: "For premium/accent use" },
] as const;

export type LogoVariantKey = (typeof LOGO_VARIANTS)[number]["key"];

// ── Brand Personas ────────────────────────────────────────────
export const BRAND_PERSONAS = {
  balancedBeauty: {
    name: "Balanced Beauty",
    description: "Effortless, natural-enhanced glam",
    traits: ["understated elegance", "natural glow", "refined simplicity"],
  },
  shesGotStyle: {
    name: "She's Got Style",
    description: "Bold, fashion-forward, statement-making",
    traits: ["unapologetic confidence", "trend-setting", "head-turning"],
  },
} as const;

// ── Color Palette Rule ────────────────────────────────────────
export const COLOR_RULE = "Dominant (~60%): Soft Pink or Creamy Beige | Supporting (~30%): Warm/Golden Brown | Accents (~10%): Charcoal or Clean White — percentages are guidelines, not hard ratios.";
