/**
 * Campaign Type Templates
 *
 * Pre-built focus areas and example hooks for each campaign type.
 * Used by the user prompt builder to give Claude specific direction
 * about what kind of script to write.
 */

import type { CampaignType } from "@/lib/types";

export interface CampaignTemplate {
  label: string;
  description: string;
  focusAreas: string[];
  exampleHooks: string[];
}

export const CAMPAIGN_TEMPLATES: Record<CampaignType, CampaignTemplate> = {
  "product-showcase": {
    label: "Product Showcase",
    description: "Highlight the product itself — packaging, quality, what makes it special.",
    focusAreas: [
      "Unboxing or first impression of the product",
      "Quality of the lashes — fiber detail, band flexibility, packaging luxury",
      "What makes CocoLash different from other brands",
      "The 'treat yourself' moment of opening a new pair",
    ],
    exampleHooks: [
      "Okay but have you SEEN these lashes up close?",
      "I need to talk about this packaging for a second...",
      "The lashes that literally changed my routine...",
      "When I tell you these are the *softest* lashes I've ever touched...",
    ],
  },

  testimonial: {
    label: "Testimonial",
    description: "Personal review style — sharing genuine experience and results.",
    focusAreas: [
      "Personal story of discovering CocoLash",
      "Before vs after transformation",
      "How the lashes make her feel — confidence, beauty, empowerment",
      "Specific moments the lashes elevated (date night, event, daily wear)",
    ],
    exampleHooks: [
      "Okay I've been wearing these for two weeks and I have *thoughts*...",
      "So I finally tried those lashes everyone's been talking about...",
      "Real talk — I was skeptical about another lash brand. But then...",
      "The difference these lashes made at my sister's wedding? Let me tell you...",
    ],
  },

  promo: {
    label: "Sale / Promotion",
    description: "Urgency-driven — there's a deal, a drop, or a limited offer.",
    focusAreas: [
      "The specific offer (discount, bundle, free shipping, limited edition)",
      "Why NOW is the time to try CocoLash",
      "Value proposition — what they're getting vs what they'd pay elsewhere",
      "Scarcity or exclusivity angle",
    ],
    exampleHooks: [
      "Stop scrolling — this sale literally ends tonight...",
      "If you've been on the fence about CocoLash... THIS is your sign.",
      "I'm about to save you money and upgrade your lash game at the same time...",
      "They put my favorites on sale and I'm not gatekeeping...",
    ],
  },

  educational: {
    label: "Educational / Tutorial",
    description: "Teaching or informing — application tips, lash care, styling advice.",
    focusAreas: [
      "How to apply lashes quickly and correctly",
      "Lash care and maintenance tips",
      "How to choose the right lash style for your eye shape",
      "Common mistakes and how to avoid them",
    ],
    exampleHooks: [
      "Okay so you've been putting on your lashes wrong... let me help.",
      "The ONE trick that made my lash application take 2 minutes flat...",
      "Not sure which lash style suits your eye shape? Watch this.",
      "Three mistakes that are *ruining* your lash game...",
    ],
  },

  unboxing: {
    label: "Unboxing",
    description: "First look, unboxing experience — ASMR-ish, visual, tactile.",
    focusAreas: [
      "The packaging experience — opening the box, unwrapping",
      "First tactile impression — touching the lashes, the band, the case",
      "What's included — product, tools, extras",
      "The satisfying reveal moment",
    ],
    exampleHooks: [
      "My CocoLash order just arrived and I'm opening it live...",
      "The packaging alone... okay let's see what's inside.",
      "ASMR unboxing of the prettiest lashes I've ever ordered...",
      "New lash day hits different when the packaging looks like THIS...",
    ],
  },

  "before-after": {
    label: "Before & After",
    description: "Transformation content — showing the dramatic difference lashes make.",
    focusAreas: [
      "The bare-lash 'before' — relatable, no-makeup look",
      "The application moment — quick, easy, satisfying",
      "The 'after' reveal — dramatic, confidence-boosting",
      "How the transformation makes her feel",
    ],
    exampleHooks: [
      "From 'just woke up' to 'just stepped out of Vogue' in 3 minutes...",
      "This is my face without lashes... and THIS is my face with CocoLash.",
      "The glow up is REAL and it takes literally 5 minutes...",
      "Watch my eyes go from zero to *wow* with one product...",
    ],
  },
};
