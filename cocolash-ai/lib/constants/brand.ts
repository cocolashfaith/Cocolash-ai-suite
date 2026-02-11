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
 */
export const BRAND_PALETTE = [
  { hex: "#ead1c1", label: "Soft Pink", category: "Primary (60%)" },
  { hex: "#ede5d6", label: "Creamy Beige", category: "Primary (60%)" },
  { hex: "#28150e", label: "Warm Dark Brown", category: "Secondary (30%)" },
  { hex: "#ce9765", label: "Golden Brown", category: "Secondary (30%)" },
  { hex: "#242424", label: "Charcoal", category: "Accent (10%)" },
  { hex: "#ffffff", label: "Clean White", category: "Accent (10%)" },
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
  { key: "white", label: "White Logo", description: "For dark backgrounds" },
  { key: "dark", label: "Dark Logo", description: "For light backgrounds" },
  { key: "gold", label: "Gold Logo", description: "For premium/accent use" },
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
export const COLOR_RULE = "60-30-10 Rule: 60% Primary (Pink/Beige), 30% Secondary (Brown/Gold), 10% Accents (Charcoal/White)";
