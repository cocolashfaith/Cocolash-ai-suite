/**
 * Quick test script for OpenRouter caption generation.
 * Run: ./node_modules/.bin/tsx scripts/test-captions.ts
 */

process.env.OPENROUTER_API_KEY =
  "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";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

import { generateCaptions, estimateCaptionCost } from "../lib/openrouter/captions";
import type { ImageContext, CaptionStyle, Platform } from "../lib/types";

const testContext: ImageContext = {
  category: "lash-closeup",
  lashStyle: "wispy",
  vibe: "soft-romantic",
  scene: "bedroom",
  skinTone: "medium-deep",
  seasonal: null,
  composition: "solo",
};

async function test() {
  const style: CaptionStyle = "casual";
  const platform: Platform = "instagram";

  console.log("=== OpenRouter Caption Generation Test ===");
  console.log(`Model: anthropic/claude-3.5-sonnet`);
  console.log(`Style: ${style} | Platform: ${platform}`);
  console.log(`Estimated cost: $${estimateCaptionCost(1)}`);
  console.log("---");

  const start = Date.now();
  const captions = await generateCaptions({
    imageContext: testContext,
    style,
    platform,
  });
  const elapsed = Date.now() - start;

  console.log(`\n✅ Got ${captions.length} captions in ${elapsed}ms:\n`);

  captions.forEach((c, i) => {
    console.log(`--- Caption ${i + 1} (style_match: ${c.style_match}) ---`);
    console.log(`Text: ${c.text}`);
    console.log(`Chars: ${c.character_count} | Within limit: ${c.is_within_limit}`);
    console.log();
  });
}

test().catch((e) => {
  console.error("❌ Test failed:", e.message || e);
  process.exit(1);
});
