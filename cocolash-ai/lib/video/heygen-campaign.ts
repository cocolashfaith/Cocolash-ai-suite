/**
 * HeyGen pipeline — campaign configuration for the Brand Content Studio.
 *
 * After client review, HeyGen is repositioned for educational/informational
 * content (not UGC). The talking-head avatar works well for calm, articulate
 * presenters — tutorials, brand stories, FAQs, and product education.
 *
 * Composition poses and UGC vibes are kept for backward compat / Seedance
 * but the HeyGen script step no longer uses them.
 */

import type { CampaignType, CompositionPose } from "@/lib/types";
import type { UGCVibe } from "@/lib/seedance/ugc-image-prompt";
import { UGC_VIBE_OPTIONS } from "@/lib/seedance/ugc-image-prompt";

/** Campaign types shown in the HeyGen Brand Content Studio. */
export const HEYGEN_SCRIPT_CAMPAIGN_TYPES: CampaignType[] = [
  "educational",
  "brand-story",
  "faq",
  "product-knowledge",
];

/** Type guard for HeyGen script campaigns */
export function isHeygenScriptCampaign(c: CampaignType): boolean {
  return (HEYGEN_SCRIPT_CAMPAIGN_TYPES as CampaignType[]).includes(c);
}

/**
 * Whether the given campaign type needs a product image + composition step.
 * Educational HeyGen campaigns skip composition — the person image goes
 * straight to HeyGen as the photo avatar.
 */
export function campaignNeedsComposition(campaign: CampaignType): boolean {
  const NO_COMPOSITION: CampaignType[] = [
    "educational",
    "brand-story",
    "faq",
    "product-knowledge",
  ];
  return !NO_COMPOSITION.includes(campaign);
}

// ── Legacy helpers (still used by Seedance / saved compositions) ──

const ALL_POSES: CompositionPose[] = ["holding", "applying", "selfie", "testimonial"];

export function getCompositionPosesForCampaign(
  campaign: CampaignType
): CompositionPose[] {
  switch (campaign) {
    case "product-showcase":
      return [...ALL_POSES];
    case "testimonial":
      return ["holding", "applying", "selfie", "testimonial"];
    case "promo":
      return ["holding", "selfie", "testimonial"];
    case "educational":
      return ["applying", "selfie", "testimonial"];
    default:
      return [...ALL_POSES];
  }
}

const VIBE_BY_CAMPAIGN: Record<string, UGCVibe[]> = {
  "product-showcase": [
    "excited-discovery",
    "chill-review",
    "surprised",
    "casual-unboxing",
    "ranting",
  ],
  testimonial: [
    "chill-review",
    "excited-discovery",
    "whispering-asmr",
    "ranting",
    "surprised",
  ],
  promo: ["excited-discovery", "ranting", "surprised", "chill-review"],
  educational: [
    "chill-review",
    "whispering-asmr",
    "ranting",
    "excited-discovery",
  ],
  "brand-story": [
    "chill-review",
    "whispering-asmr",
    "excited-discovery",
  ],
  faq: [
    "chill-review",
    "whispering-asmr",
    "excited-discovery",
  ],
  "product-knowledge": [
    "chill-review",
    "whispering-asmr",
    "excited-discovery",
  ],
};

export function getUgcVibeOptionsForCampaign(campaign: CampaignType) {
  const allowed = new Set(
    VIBE_BY_CAMPAIGN[campaign] ?? UGC_VIBE_OPTIONS.map((o) => o.value)
  );
  return UGC_VIBE_OPTIONS.filter((o) => allowed.has(o.value));
}

export function defaultUgcVibeForCampaign(campaign: CampaignType): UGCVibe {
  const opts = getUgcVibeOptionsForCampaign(campaign);
  return opts[0]?.value ?? "excited-discovery";
}
