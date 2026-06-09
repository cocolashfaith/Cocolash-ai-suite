/**
 * Phase 34.1 DO-FIRST validation (throwaway, not production).
 *
 * Compares two ways of generating a UGC script for a real CocoLash product:
 *   BLIND  — the current text-only generator (lib/openrouter/captions.ts).
 *            Its prompt is instructed to weave in "magnetic-closure packaging"
 *            and the unboxing framework says "show the magnetic closure" — both
 *            phantom features (no CocoLash product has a magnetic closure).
 *   VISION — model SEES the actual product images and is told to ground the
 *            script in what it observes and invent nothing.
 *
 * Outcome decides whether the R-34.1-04 vision refactor is worth building.
 * No paid render. OpenRouter Claude calls only (cents).
 *
 * Run: ./node_modules/.bin/tsx scripts/validate-vision-script.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { generateVideoScript } from "../lib/openrouter/captions";
import {
  getOpenRouterClient,
  openrouterRequest,
} from "../lib/openrouter/client";
import { detectPhantomFeatures } from "../lib/brand/product-truth";
import type { CampaignType, ScriptTone, VideoDuration } from "../lib/types";

const VISION_MODEL = "anthropic/claude-opus-4.7";
const PRODUCT_NAME = "Poppy 4-Pack";
const CATEGORY_KEY = "multi-lash-book"; // poppy-4pack's category
const TONE: ScriptTone = "casual";
const DURATION: VideoDuration = 15;
const CAMPAIGNS: CampaignType[] = ["unboxing", "product-showcase"];

async function resolveReferenceImages(): Promise<string[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: category } = await supabase
    .from("product_categories")
    .select("id")
    .eq("key", CATEGORY_KEY)
    .maybeSingle();

  if (!category?.id) {
    throw new Error(`No category for key "${CATEGORY_KEY}"`);
  }

  const { data: rows, error } = await supabase
    .from("product_reference_images")
    .select("image_url")
    .eq("category_id", category.id as string)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (rows ?? []).map((r) => r.image_url as string);
}

/** Minimal JSON-script parser for the vision arm (mirrors captions.ts logic). */
function parseScripts(raw: string): string[] {
  let cleaned = raw.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s !== -1 && e !== -1 && e > s) cleaned = cleaned.slice(s, e + 1);
  try {
    const data = JSON.parse(cleaned);
    const arr = Array.isArray(data?.scripts) ? data.scripts : [];
    return arr.map(
      (x: { full_script?: string }) => String(x.full_script ?? "")
    );
  } catch {
    return [];
  }
}

async function visionScript(
  campaignType: CampaignType,
  imageUrls: string[]
): Promise<string[]> {
  const client = getOpenRouterClient();

  const system = `You are a UGC script writer for CocoLash videos generated with Seedance 2.0.

You can SEE the product images attached to this message. Write 3 short spoken scripts (~${DURATION}s, 32-42 words each) for a "${campaignType}" video.

GROUNDING RULES (critical):
- Describe ONLY product details you can actually see in the images: packaging style, lash style/shape, band, tray, colour, texture.
- Invent NOTHING. If a feature is not visibly present, do not mention it.
- CocoLash has NO magnetic closure on any product — never mention magnetic anything.
- Spoken dialogue only: contractions, short sentences, no stage directions, no emojis, no hashtags.
- Mention CocoLash naturally at least once. Tone: ${TONE}.

Return valid JSON only:
{"scripts":[{"full_script":"..."},{"full_script":"..."},{"full_script":"..."}]}`;

  const userText = `Product: ${PRODUCT_NAME}. Campaign: ${campaignType}. Look at the images, then write the 3 scripts grounded in what you see.`;

  const imageParts = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));

  const completion = await openrouterRequest(() =>
    client.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 2048,
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [...imageParts, { type: "text" as const, text: userText }],
        },
      ],
    })
  );

  return parseScripts(completion.choices[0]?.message?.content ?? "");
}

function report(label: string, scripts: string[]): number {
  let totalPhantoms = 0;
  console.log(`\n  ── ${label} (${scripts.length} scripts) ──`);
  scripts.forEach((s, i) => {
    const phantoms = detectPhantomFeatures(s);
    totalPhantoms += phantoms.length;
    console.log(`  [${i + 1}] ${s}`);
    if (phantoms.length) {
      phantoms.forEach((p) => console.log(`      ⚠️  ${p}`));
    } else {
      console.log(`      ✅ no phantom features`);
    }
  });
  return totalPhantoms;
}

async function main() {
  console.log("=== Phase 34.1 DO-FIRST validation: blind vs vision script ===");
  console.log(`Product: ${PRODUCT_NAME} | category: ${CATEGORY_KEY}`);

  const imageUrls = await resolveReferenceImages();
  console.log(`Reference images resolved: ${imageUrls.length}`);
  imageUrls.forEach((u, i) => console.log(`  img${i + 1}: ${u}`));
  if (imageUrls.length === 0) {
    throw new Error("No reference images — cannot run the vision arm.");
  }

  let blindTotal = 0;
  let visionTotal = 0;

  for (const campaignType of CAMPAIGNS) {
    console.log(`\n\n========== CAMPAIGN: ${campaignType} ==========`);

    const blind = await generateVideoScript({
      pipeline: "seedance",
      campaignType,
      tone: TONE,
      duration: DURATION,
      productName: PRODUCT_NAME,
    });
    blindTotal += report(
      "BLIND (current text-only generator)",
      blind.map((s) => s.full_script)
    );

    const vision = await visionScript(campaignType, imageUrls);
    visionTotal += report("VISION (sees product images)", vision);
  }

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`BLIND  total phantom-feature hits: ${blindTotal}`);
  console.log(`VISION total phantom-feature hits: ${visionTotal}`);
  console.log(
    `Phantom reduction: ${blindTotal - visionTotal} fewer with vision`
  );
}

main().catch((err) => {
  console.error("VALIDATION FAILED:", err);
  process.exit(1);
});
