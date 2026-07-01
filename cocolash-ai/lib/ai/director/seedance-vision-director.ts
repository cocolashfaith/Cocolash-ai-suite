/**
 * Seedance Vision Director — vision-capable prompt-writing service.
 *
 * Analyzes selected product + influencer images alongside the script and
 * generates a high-quality Seedance-ready prompt with @-mention role
 * assignment and product-grounded details.
 *
 * Model: Claude Opus 4.7 (vision-capable) via the project's OpenRouter client —
 * the same model the text Seedance Director uses (a known-good OpenRouter endpoint).
 * Per D-34-04 (BLOCKER 1 decision): productSku is OPTIONAL; images are the
 * primary source of truth. Vision agent grounds prompts in actual images;
 * product-truth is supplementary.
 */

import { getProductTruthBySku } from "@/lib/brand/product-truth";
import type { ProductTruthEntry } from "@/lib/brand/product-truth";
import { getOpenRouterClient, openrouterRequest } from "@/lib/openrouter/client";

/**
 * Vision-capable model id (OpenRouter). Image-grounded prompt writing.
 * Matches the text Director's model (`anthropic/claude-opus-4.7`) — a current
 * Opus model (≥ 4.6) confirmed available on this project's OpenRouter account.
 */
export const SEEDANCE_VISION_DIRECTOR_MODEL = "anthropic/claude-opus-4.7";

/**
 * Input to the vision director. Images are the PRIMARY source of product truth.
 * productSku is OPTIONAL and used only for supplementary grounding.
 */
export interface VisionPromptInput {
  /** URL of the influencer/creator image (first position, @influencer_image1) */
  influencerImageUrl: string;
  /** URLs of product images from different angles (2–9 images, @product_image1..N) */
  productImageUrls: string[];
  /** The spoken script the creator will say on camera */
  script: string;
  /** Campaign context (e.g., "product-showcase", "tutorial") */
  campaignType: string;
  /** OPTIONAL: Product SKU for supplementary grounding. If absent, uses images alone. */
  productSku?: string;
  /** OPTIONAL: Creator's stated direction or intent */
  intent?: string;
  /** OPTIONAL: Pre-extracted product facts (R-34.1-04), already formatted as a
   *  prompt block. Shares the script's source of truth so prompt and script
   *  can't drift. */
  productFacts?: string;
  /** OPTIONAL: when set, the user asked for a fresh take (explicit "Regenerate").
   *  We append this as a variation instruction and raise sampling temperature so
   *  the Director proposes a distinctly different setting/scene than before,
   *  instead of settling on the same cozy default every time. */
  variationHint?: string;
}

/**
 * Output from the vision director: a Seedance-ready prompt string
 * with @-mention role assignment and product-grounded details.
 */
export interface VisionPromptOutput {
  /** The generated prompt, ready to send to Seedance API */
  prompt: string;
  /** Diagnostics for debugging and cost tracking */
  diagnostics: {
    model: string;
    durationMs: number;
    inputSummary: string;
  };
}

/**
 * Generate a Seedance prompt from selected images, script, and optional product truth.
 *
 * The vision agent:
 * 1. Analyzes the uploaded influencer + product images visually
 * 2. Grounds the prompt in what it sees (product features, packaging, scene context)
 * 3. Uses optional product-truth data as supplementary anchor (brand-level constraints)
 * 4. Writes explicit on-screen actions (hold, turn, open, demonstrate)
 * 5. Appends the spoken script verbatim
 * 6. Uses @-mention tokens aligned with image array order:
 *    - @influencer_image1 = first image (influencer)
 *    - @product_image1..N = subsequent images (products, in array order)
 *
 * Per D-34-04: Product identity comes ONLY from the images. If productSku is
 * absent, the prompt is grounded in image analysis alone, preventing false
 * claims (e.g., "magnetic closure" is visible nowhere → won't be invented).
 */
export async function generateSeedanceVisionPrompt(
  input: VisionPromptInput
): Promise<VisionPromptOutput> {
  validateVisionInput(input);

  const start = Date.now();

  // Resolve product truth for supplementary grounding (OPTIONAL per D-34-04)
  const productTruth = input.productSku
    ? getProductTruthBySku(input.productSku) ?? null
    : null;

  const truthContext = productTruth
    ? buildProductTruthContext(productTruth)
    : "";

  // Build system prompt (encodes brand-level CocoLash truth)
  const systemPrompt = buildVisionDirectorSystemPrompt(truthContext);

  // Build user prompt (context for this specific task)
  let userPrompt = buildVisionDirectorUserPrompt(input, productTruth);

  // Explicit regeneration: nudge the Director toward a distinctly different
  // scene so repeated clicks don't keep returning the same setup, and sample
  // with a higher temperature for genuine variety.
  const isVariation = !!input.variationHint?.trim();
  if (isVariation) {
    userPrompt += `\n\nVARIATION REQUEST (the user clicked "Regenerate" for a fresh take): ${input.variationHint!.trim()} Keep the product identity, script, and on-screen actions accurate, but change the setting, location, time of day, props, framing, and overall vibe so this reads as a clearly different scene.`;
  }

  // Call vision model
  const prompt = await callVisionModel(
    systemPrompt,
    userPrompt,
    input.influencerImageUrl,
    input.productImageUrls,
    isVariation ? 0.9 : undefined
  );

  const durationMs = Date.now() - start;

  return {
    prompt,
    diagnostics: {
      model: SEEDANCE_VISION_DIRECTOR_MODEL,
      durationMs,
      inputSummary: summarizeVisionInput(input, productTruth),
    },
  };
}

// ── Input validation ─────────────────────────────────────────

function validateVisionInput(input: VisionPromptInput): void {
  if (!input.influencerImageUrl?.trim()) {
    throw new VisionDirectorError(
      "INVALID_INPUT",
      "influencerImageUrl is required"
    );
  }

  if (!Array.isArray(input.productImageUrls) || input.productImageUrls.length === 0) {
    throw new VisionDirectorError(
      "INVALID_INPUT",
      "productImageUrls must be a non-empty array"
    );
  }

  if (input.productImageUrls.length > 9) {
    throw new VisionDirectorError(
      "INVALID_INPUT",
      "productImageUrls exceeds 9 images (API limit)"
    );
  }

  if (!input.script?.trim()) {
    throw new VisionDirectorError("INVALID_INPUT", "script is required");
  }

  if (!input.campaignType?.trim()) {
    throw new VisionDirectorError("INVALID_INPUT", "campaignType is required");
  }

  // Validate all URLs are HTTPS (security: T-34-V5)
  const allUrls = [input.influencerImageUrl, ...input.productImageUrls];
  for (const url of allUrls) {
    if (!url.startsWith("https://")) {
      throw new VisionDirectorError(
        "INVALID_INPUT",
        `Image URL must be HTTPS: ${url.substring(0, 50)}...`
      );
    }
  }
}

// ── Vision model call ────────────────────────────────────────

/**
 * Call the vision model to analyze images and generate the prompt.
 *
 * Designed to be mockable for testing (see tests/ai/director/seedance-vision-director.test.ts).
 * In production it uses the project's OpenRouter client (OpenAI-compatible) to call a
 * vision-capable Claude model, passing images as `image_url` content parts in a
 * deterministic order: influencer first, then products in array order.
 */
export async function callVisionModel(
  systemPrompt: string,
  userPrompt: string,
  influencerImageUrl: string,
  productImageUrls: string[],
  /** Optional sampling temperature. Omitted = provider default (grounded
   *  initial run); a higher value is passed on explicit regeneration for
   *  scene variety. */
  temperature?: number
): Promise<string> {
  const client = getOpenRouterClient();

  // Image content parts — influencer first so @influencer_image1 maps to it,
  // then products so @product_image1..N map in array order.
  const imageParts = [
    { type: "image_url" as const, image_url: { url: influencerImageUrl } },
    ...productImageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  ];

  const completion = await openrouterRequest(() =>
    client.chat.completions.create({
      model: SEEDANCE_VISION_DIRECTOR_MODEL,
      max_tokens: 1024,
      ...(temperature !== undefined ? { temperature } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [...imageParts, { type: "text" as const, text: userPrompt }],
        },
      ],
    })
  );

  const prompt = completion.choices[0]?.message?.content?.trim() ?? "";

  if (!prompt) {
    throw new VisionDirectorError(
      "EMPTY_RESPONSE",
      "Vision agent returned no prompt"
    );
  }

  return prompt;
}

// ── System prompt construction ───────────────────────────────

function buildVisionDirectorSystemPrompt(truthContext: string): string {
  return `You are a Seedance 2.0 prompt specialist. Your job is to write a compelling, product-accurate UGC-style Seedance prompt that will drive an image-to-video AI model to generate a short video (4–15 seconds).

You have access to the selected images submitted by the user (1 influencer + 2–9 product images). Analyze them carefully. Do NOT reference or process any images outside this set.

KEY RULES FOR @-MENTION TOKENS:

The images are submitted in this order:
1. Image 1 (first image): The influencer/creator → reference as @influencer_image1
2. Image 2+ (subsequent images): Product angles → reference as @product_image1, @product_image2, etc.

Example with 4 images total (1 influencer + 3 products):
- Image 1 (influencer) = @influencer_image1
- Image 2 (product) = @product_image1
- Image 3 (product) = @product_image2
- Image 4 (product) = @product_image3

STYLE REQUIREMENTS:

1. Write EXPLICIT, CONCRETE on-screen ACTIONS:
   - "holds up the box"
   - "turns to show the front"
   - "opens the box"
   - "points to the tray"
   - "demonstrates the bands"
   - "looks at camera" / "speaks directly to camera"

2. Describe the SCENE and LIGHTING:
   - "cozy dim bedroom"
   - "warm fairy lights"
   - "natural sunlight"
   - "intimate / unpolished / real / casual vibe"

3. Include VIBE and TONE:
   - casual, genuine, excited, authentic, candid
   - "talking casually and excitedly like a genuine product review"
   - "natural handheld shake, candid expressions"

4. Append the spoken SCRIPT verbatim at the end:
   - "Script she is speaking: [exact words from the script]"

PRODUCT TRUTH AND HONESTY:

Based on what you see in the images:
- CocoLash lashes are cluster/wispy bands on FLEXIBLE bands (NOT rigid, NOT plastic)
- CocoLash lash trays and multi-lash books do NOT have magnetic closures — only the full kits do; never invent a magnetic closure you cannot clearly see in the images
- CocoLash packaging is a black hardcover-style book or tray (not leather, not a case)

Do NOT invent features you don't see in the images. If the images show something, describe it. If you don't see it, don't mention it.

${truthContext}

OUTPUT:

Return ONLY the Seedance prompt text. No markdown, no code fences, no preamble, no "Here's your prompt:" — just the raw prompt, ready to send to Seedance.`;
}

function buildProductTruthContext(truth: ProductTruthEntry): string {
  return `SUPPLEMENTARY PRODUCT CONTEXT (from database):
- Name: ${truth.displayName}
- Type: ${truth.lashType}${truth.lengthRange ? ` (${truth.lengthRange})` : ""}
- Packaging: ${truth.packagingType}
- Band Material: ${truth.bandMaterial}
- Magnetic Closure: ${truth.magneticClosure ? "YES" : "NO — never mention magnetic"}
- Key Features: ${truth.bestFor || "(none specified)"}

REMEMBER: Your analysis of the images is PRIMARY. If the images contradict the database, trust the images.
`;
}

function buildVisionDirectorUserPrompt(
  input: VisionPromptInput,
  productTruth: ProductTruthEntry | null
): string {
  const lines: string[] = [];

  lines.push("Here are the images the creator will use:");
  lines.push("[Image 1: Influencer / Creator]");
  lines.push("[Images 2+: Product images from different angles]");
  lines.push("");

  lines.push(`Creator's script (what they will say on camera):`);
  lines.push(`"${input.script}"`);
  lines.push("");

  lines.push(`Campaign type: ${input.campaignType}`);

  if (input.productFacts) {
    lines.push("");
    lines.push(input.productFacts);
  }

  if (input.intent) {
    lines.push(`Creator intent / direction: ${input.intent}`);
  }

  if (productTruth) {
    lines.push(`Product: ${productTruth.displayName}`);
  }

  lines.push("");
  lines.push("Write the Seedance prompt. Remember:");
  lines.push("- @influencer_image1 for the first image (creator)");
  lines.push("- @product_image1, @product_image2, etc. for product images (in order)");
  lines.push("- Explicit actions (hold, turn, open, demonstrate)");
  lines.push("- Scene and lighting description");
  lines.push("- Append the script at the end verbatim");
  lines.push("- Base all product descriptions on what you see in the images");

  return lines.join("\n");
}

// ── Diagnostic helpers ───────────────────────────────────────

function summarizeVisionInput(
  input: VisionPromptInput,
  productTruth: ProductTruthEntry | null
): string {
  const summary: string[] = [
    `productCount=${input.productImageUrls.length}`,
    `scriptLength=${input.script.length}`,
    `campaign=${input.campaignType}`,
  ];

  if (input.intent) summary.push(`intent=yes`);
  if (productTruth) summary.push(`product=${productTruth.sku}`);

  return summary.join(" ");
}

// ── Error type ───────────────────────────────────────────────

export class VisionDirectorError extends Error {
  constructor(
    public code:
      | "INVALID_INPUT"
      | "EMPTY_RESPONSE"
      | "API_ERROR"
      | "TIMEOUT",
    message: string
  ) {
    super(message);
    this.name = "VisionDirectorError";
  }
}
