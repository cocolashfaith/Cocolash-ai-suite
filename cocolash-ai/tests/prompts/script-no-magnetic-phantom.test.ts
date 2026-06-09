/**
 * Phase 34.1 Group A regression guard.
 *
 * The blind script generator used to be INSTRUCTED to weave in a magnetic
 * closure ("Luxury magnetic-closure packaging", "show the magnetic closure")
 * even though only the full kits are magnetic — lash trays and books are not.
 * These static lies seeded the phantom feature the user saw in live testing.
 *
 * This test asserts no script-generation prompt asserts "magnetic" universally.
 * Kit-specific magnetic facts are allowed to surface via SKU truth / vision,
 * NOT via campaign-wide prompt boilerplate.
 */

import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_CONCEPT_POOLS,
} from "@/lib/prompts/scripts/templates";
import { buildScriptSystemPrompt } from "@/lib/prompts/scripts/system";
import { buildScriptUserPrompt } from "@/lib/prompts/scripts/user";
import {
  buildSeedanceScriptSystemPrompt,
  buildSeedanceScriptUserPrompt,
} from "@/lib/prompts/scripts/seedance";
import type { CampaignType } from "@/lib/types";

const ALL_CAMPAIGNS: CampaignType[] = [
  "product-showcase",
  "testimonial",
  "promo",
  "educational",
  "unboxing",
  "before-after",
  "brand-story",
  "faq",
  "myths",
  "product-knowledge",
];

describe("script prompts contain no universal magnetic assertion", () => {
  it("CAMPAIGN_TEMPLATES has no 'magnetic' anywhere", () => {
    expect(JSON.stringify(CAMPAIGN_TEMPLATES)).not.toMatch(/magnet/i);
  });

  it("CAMPAIGN_CONCEPT_POOLS has no 'magnetic' anywhere", () => {
    expect(JSON.stringify(CAMPAIGN_CONCEPT_POOLS)).not.toMatch(/magnet/i);
  });

  it("seedance + heygen system prompts have no 'magnetic'", () => {
    expect(buildSeedanceScriptSystemPrompt()).not.toMatch(/magnet/i);
    expect(buildScriptSystemPrompt()).not.toMatch(/magnet/i);
  });

  it("no built user prompt mentions 'magnetic' for any campaign type", () => {
    for (const campaignType of ALL_CAMPAIGNS) {
      const params = {
        campaignType,
        tone: "casual" as const,
        duration: 15 as const,
      };
      const seedance = buildSeedanceScriptUserPrompt(params);
      const heygen = buildScriptUserPrompt(params);
      expect(seedance, `seedance/${campaignType}`).not.toMatch(/magnet/i);
      expect(heygen, `heygen/${campaignType}`).not.toMatch(/magnet/i);
    }
  });
});
