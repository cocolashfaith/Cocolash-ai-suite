/**
 * HeyGen pipeline — campaign-specific composition poses and UGC vibe options.
 * (HeyGen script step only offers a subset of campaign types; see HEYGEN_SCRIPT_CAMPAIGN_TYPES.)
 */

import type { CampaignType, CompositionPose } from "@/lib/types";
import type { UGCVibe } from "@/lib/seedance/ugc-image-prompt";
import { UGC_VIBE_OPTIONS } from "@/lib/seedance/ugc-image-prompt";

/** Campaign types shown in the HeyGen script step (excludes unboxing & before-after). */
export const HEYGEN_SCRIPT_CAMPAIGN_TYPES: CampaignType[] = [
  "product-showcase",
  "testimonial",
  "promo",
  "educational",
];

/** Type guard for HeyGen script campaigns */
export function isHeygenScriptCampaign(c: CampaignType): boolean {
  return (HEYGEN_SCRIPT_CAMPAIGN_TYPES as CampaignType[]).includes(c);
}

const ALL_POSES: CompositionPose[] = ["holding", "applying", "selfie", "testimonial"];

/** Composition poses available per campaign (educational excludes product-holding). */
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
};

/** UGC avatar vibe dropdown options filtered by HeyGen campaign type. */
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
