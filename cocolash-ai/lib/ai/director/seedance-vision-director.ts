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
import { SEEDANCE_25_LIMITS } from "@/lib/seedance/v25/types";
import {
  buildSeedanceVisionDirectorPrompt,
  productImageTokens,
  SEEDANCE_VISION_DIRECTOR_PROMPT_ID,
} from "@/lib/ai/director/system-prompts";

/**
 * Vision-capable model id (OpenRouter). Image-grounded prompt writing.
 * Matches the text Director's model (`anthropic/claude-opus-4.7`) — a current
 * Opus model (≥ 4.6) confirmed available on this project's OpenRouter account.
 */
export const SEEDANCE_VISION_DIRECTOR_MODEL = "anthropic/claude-opus-4.7";

/**
 * Stable id for the system prompt this director builds, reported in
 * `diagnostics.systemPromptId` so Step 3 can attribute the prompt the same way
 * the text Director's output is attributed (instead of rendering a bare "?").
 *
 * Defined in `system-prompts.ts` alongside the prompt itself so the id in
 * `PROMPT_REGISTRY` (and therefore /admin/prompts) can never drift from the id
 * this module reports. Re-exported here: SEEDANCE_VISION_DIRECTOR_PROMPT_ID is
 * this module's public contract.
 */
export { SEEDANCE_VISION_DIRECTOR_PROMPT_ID };

/**
 * Max completion tokens for one prompt-writing call. 1024 truncated real
 * prompts once the Director had to describe every supplied image, and a
 * truncated prompt used to be returned silently as if it were finished.
 */
export const VISION_DIRECTOR_MAX_TOKENS = 2048;

/**
 * Input to the vision director. Images are the PRIMARY source of product truth.
 * productSku is OPTIONAL and used only for supplementary grounding.
 */
export interface VisionPromptInput {
  /** URL of the primary influencer/creator image (first position, @influencer_image1) */
  influencerImageUrl: string;
  /**
   * OPTIONAL: several influencer/creator references (@influencer_image1..N).
   * Seedance 2.5 accepts up to 30 images in total. When present, position 0 is
   * the same image as `influencerImageUrl` (the caller keeps them in sync); the
   * single-field contract still works on its own.
   */
  influencerImageUrls?: string[];
  /** URLs of product images from different angles (1–30 images, @product_image1..N) */
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
  /**
   * What the Director dropped or reworded because the script claimed a physical
   * feature it could not see in the images. Empty when the script was clean.
   * Never part of `prompt` — this is for the user, not for Seedance.
   */
  scriptAudit: string[];
  /** Diagnostics for debugging and cost tracking */
  diagnostics: {
    model: string;
    /** Which system prompt wrote this — surfaced in the Step 3 attribution line. */
    systemPromptId: string;
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
 * 4. Writes explicit on-screen actions (hold, turn, open, demonstrate) — only
 *    for things actually visible in the images
 * 5. Appends the spoken script, rewording only claims the images contradict,
 *    and reports those changes in `scriptAudit`
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

  const influencerUrls = resolveInfluencerImageUrls(input);

  // Build system prompt. It enumerates one @product_imageN token per supplied
  // image, so the Director cannot quietly skip the angles it finds boring.
  const systemPrompt = buildSeedanceVisionDirectorPrompt({
    truthContext,
    influencerCount: influencerUrls.length,
    productImageCount: input.productImageUrls.length,
  });

  // Build user prompt (context for this specific task)
  let userPrompt = buildVisionDirectorUserPrompt(
    input,
    productTruth,
    influencerUrls.length
  );

  // Explicit regeneration: nudge the Director toward a distinctly different
  // scene so repeated clicks don't keep returning the same setup, and sample
  // with a higher temperature for genuine variety.
  const isVariation = !!input.variationHint?.trim();
  if (isVariation) {
    userPrompt += `\n\nVARIATION REQUEST (the user clicked "Regenerate" for a fresh take): ${input.variationHint!.trim()} Change the setting, location, time of day, background props, framing and overall vibe so this reads as a clearly different scene. The honesty rules do not relax for a variation: do NOT invent a new product, a new package, a new product feature or a new product prop, do not stage an interaction the images don't support, and still reference every @product_image token with what it actually shows. Variety lives in the room, not in the product.`;
  }

  // Call vision model. Influencer references go first so @influencer_image1..N
  // map to them in order, then products as @product_image1..N.
  const raw = await callVisionModel(
    systemPrompt,
    userPrompt,
    influencerUrls,
    input.productImageUrls,
    isVariation ? 0.9 : undefined
  );

  // The audit is addressed to the user, not to Seedance: split it off so no
  // "dropped 'glass cover'" line can ever be rendered as a visual instruction.
  const { prompt, scriptAudit } = splitPromptAndAudit(raw);

  if (!prompt) {
    throw new VisionDirectorError(
      "EMPTY_RESPONSE",
      "Vision agent returned only a script audit and no prompt"
    );
  }

  const durationMs = Date.now() - start;

  return {
    prompt,
    scriptAudit,
    diagnostics: {
      model: SEEDANCE_VISION_DIRECTOR_MODEL,
      systemPromptId: SEEDANCE_VISION_DIRECTOR_PROMPT_ID,
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

  if (input.productImageUrls.length > SEEDANCE_25_LIMITS.maxImages) {
    throw new VisionDirectorError(
      "INVALID_INPUT",
      `productImageUrls exceeds ${SEEDANCE_25_LIMITS.maxImages} images (API limit)`
    );
  }

  if (
    input.influencerImageUrls &&
    input.influencerImageUrls.length > SEEDANCE_25_LIMITS.maxImages
  ) {
    throw new VisionDirectorError(
      "INVALID_INPUT",
      `influencerImageUrls exceeds ${SEEDANCE_25_LIMITS.maxImages} images (API limit)`
    );
  }

  const totalImages =
    (input.influencerImageUrls?.length ?? 1) + input.productImageUrls.length;
  if (totalImages > SEEDANCE_25_LIMITS.maxImages) {
    throw new VisionDirectorError(
      "INVALID_INPUT",
      `influencer + product images exceed ${SEEDANCE_25_LIMITS.maxImages} images combined (API limit)`
    );
  }

  if (!input.script?.trim()) {
    throw new VisionDirectorError("INVALID_INPUT", "script is required");
  }

  if (!input.campaignType?.trim()) {
    throw new VisionDirectorError("INVALID_INPUT", "campaignType is required");
  }

  // Validate all URLs are HTTPS (security: T-34-V5)
  const allUrls = [
    input.influencerImageUrl,
    ...(input.influencerImageUrls ?? []),
    ...input.productImageUrls,
  ];
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
  /** One influencer URL, or several (@influencer_image1..N, in order). */
  influencerImageUrl: string | string[],
  productImageUrls: string[],
  /** Optional sampling temperature. Omitted = provider default (grounded
   *  initial run); a higher value is passed on explicit regeneration for
   *  scene variety. */
  temperature?: number
): Promise<string> {
  const client = getOpenRouterClient();

  // Image content parts — influencers first so @influencer_image1..N map to
  // them in order, then products so @product_image1..N map in array order.
  const influencerUrls = Array.isArray(influencerImageUrl)
    ? influencerImageUrl
    : [influencerImageUrl];
  const imageParts = [...influencerUrls, ...productImageUrls].map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));

  const completion = await openrouterRequest(() =>
    client.chat.completions.create({
      model: SEEDANCE_VISION_DIRECTOR_MODEL,
      max_tokens: VISION_DIRECTOR_MAX_TOKENS,
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

  const choice = completion.choices[0];
  const prompt = choice?.message?.content?.trim() ?? "";

  // A cut-off prompt used to be returned as if it were finished — a prompt that
  // stops mid-sentence (or before the later @product_image tokens) is exactly
  // the kind of gap the video model fills by inventing. Fail loudly instead.
  if (isTruncatedFinishReason(choice?.finish_reason)) {
    throw new VisionDirectorError(
      "TRUNCATED_RESPONSE",
      `Vision agent response was cut off at the ${VISION_DIRECTOR_MAX_TOKENS}-token limit (finish_reason="${String(
        choice?.finish_reason
      )}"). Refusing to return a truncated prompt.`
    );
  }

  if (!prompt) {
    throw new VisionDirectorError(
      "EMPTY_RESPONSE",
      "Vision agent returned no prompt"
    );
  }

  return prompt;
}

/**
 * Whether the provider stopped because it hit the token cap. OpenRouter
 * normalises to OpenAI's "length", but upstream providers leak their own
 * spelling ("max_tokens", Google's "MAX_TOKENS"), so match both.
 */
export function isTruncatedFinishReason(finishReason: unknown): boolean {
  if (typeof finishReason !== "string") return false;
  const reason = finishReason.trim().toLowerCase();
  return reason === "length" || reason.replace(/[\s-]/g, "_").includes("max_token");
}

/**
 * Split the model's reply into the Seedance prompt and the script audit.
 *
 * The Director reports what it dropped or reworded after a `---SCRIPT AUDIT---`
 * marker. That report is for the human reviewing Step 3; it must never reach
 * Seedance, which would happily render "dropped: glass cover" as a glass cover.
 */
export function splitPromptAndAudit(raw: string): {
  prompt: string;
  scriptAudit: string[];
} {
  const text = raw?.trim() ?? "";
  const lines = text.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => AUDIT_MARKER.test(line));

  if (markerIndex === -1) return { prompt: text, scriptAudit: [] };

  const prompt = lines.slice(0, markerIndex).join("\n").trim();
  const scriptAudit = lines
    .slice(markerIndex + 1)
    .map((line) => line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0 && !NO_AUDIT_FINDINGS.test(line));

  return { prompt, scriptAudit };
}

/** `---SCRIPT AUDIT---`, tolerating stray dashes, colons and markdown hashes. */
const AUDIT_MARKER = /^\s*[-#*\s]*script\s*audit[-#*\s:]*$/i;

/** "none", "no changes", "n/a" — a clean audit is an empty audit. */
const NO_AUDIT_FINDINGS =
  /^(?:none|n\/a|no(?:ne)?[ .]*(?:changes?|edits?|issues?|corrections?|claims?)?\.?)$/i;

/**
 * The influencer references in @influencer_image1..N order. Callers may pass
 * either the single legacy field or the 2.5 array; when both are present the
 * array wins and the single field is expected to be its first entry.
 */
function resolveInfluencerImageUrls(input: VisionPromptInput): string[] {
  const many = input.influencerImageUrls?.filter(Boolean) ?? [];
  if (many.length === 0) return [input.influencerImageUrl];
  return many.includes(input.influencerImageUrl)
    ? many
    : [input.influencerImageUrl, ...many];
}

// ── System prompt construction ───────────────────────────────

/**
 * Render the DB entry for the chosen SKU as supplementary context.
 *
 * Everything here is a real, per-SKU fact. Nothing brand-wide is asserted:
 * the three "Based on what you see in the images" bullets that used to live in
 * the system prompt (cluster/wispy on FLEXIBLE bands · trays have no magnetic
 * closure · black hardcover book/tray) were wrong for several SKUs and were
 * handed to the model as if they were observations.
 */
function buildProductTruthContext(truth: ProductTruthEntry): string {
  const lines: string[] = [
    `- Name: ${truth.displayName}`,
    `- Type: ${truth.lashType}${truth.lengthRange ? ` (${truth.lengthRange})` : ""}`,
    `- Packaging: ${truth.packagingType}`,
    `- Band material: ${truth.bandMaterial}`,
  ];

  // Positive statements only (G5): a "NO magnetic" line is a negation, and
  // video models render the negated noun. Absence is expressed by omission.
  if (truth.magneticClosure) lines.push("- Closure: magnetic");
  if (truth.colorTone) lines.push(`- Colour tone: ${truth.colorTone}`);
  if (truth.kitContents?.length) {
    lines.push(`- Kit contents: ${truth.kitContents.join(", ")}`);
  }
  if (truth.bestFor) lines.push(`- Best for: ${truth.bestFor}`);

  // Fields package C is adding to ProductTruthEntry (lidType, hasMirror,
  // exteriorColor, …). Read them structurally so they flow through the moment
  // they land, without this module needing to change again.
  for (const [key, label] of OPTIONAL_TRUTH_FIELDS) {
    const value = (truth as unknown as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      lines.push(`- ${label}: ${value.trim()}`);
    } else if (value === true) {
      lines.push(`- ${label}: yes`);
    }
  }

  return `SUPPLEMENTARY PRODUCT CONTEXT (from the product database, for the SKU the user selected):
${lines.join("\n")}

REMEMBER: Your analysis of the images is PRIMARY. If the images contradict the database, trust the images, and say so in the script audit.
`;
}

/** Optional `ProductTruthEntry` fields rendered when present (see package C). */
const OPTIONAL_TRUTH_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["lidType", "Lid"],
  ["hasMirror", "Mirror inside the lid"],
  ["transparentWindow", "Transparent window"],
  ["exteriorColor", "Exterior colour"],
  ["interiorColor", "Interior colour"],
  ["boxMaterial", "Box material"],
  ["finish", "Finish"],
];

function buildVisionDirectorUserPrompt(
  input: VisionPromptInput,
  productTruth: ProductTruthEntry | null,
  influencerCount = 1
): string {
  const lines: string[] = [];
  const n = Math.max(1, influencerCount);
  const tokens = productImageTokens(input.productImageUrls.length);

  lines.push("Here are the images the creator will use:");
  if (n === 1) {
    lines.push("[Image 1: Influencer / Creator → @influencer_image1]");
  } else {
    lines.push(
      `[Images 1-${n}: ${n} influencer references (@influencer_image1…@influencer_image${n})]`
    );
  }
  // One line per product image, so "which token is which angle" is never a
  // guess and a skipped image is visibly a skipped line.
  tokens.forEach((token, i) => {
    lines.push(`[Image ${n + i + 1}: product angle → ${token}]`);
  });
  lines.push("");

  lines.push(`Creator's script (what they will say on camera):`);
  lines.push(`"${input.script}"`);
  lines.push(
    "This script was written WITHOUT seeing the product. Audit every physical claim in it against the images before you stage anything."
  );
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
  lines.push(
    n === 1
      ? "- @influencer_image1 for the first image (creator)"
      : `- @influencer_image1…@influencer_image${n} for the first ${n} images (creator references, identity anchored on @influencer_image1)`
  );
  lines.push(
    `- Reference all ${tokens.length} product token${
      tokens.length === 1 ? "" : "s"
    } — ${tokens.join(", ")} — each with a short description of what that image shows`
  );
  lines.push(
    "- Explicit actions (hold, turn, open, demonstrate) — but only on things visible in the images"
  );
  lines.push("- Scene and lighting description");
  lines.push(
    "- Append the script at the end, word-for-word except for any wording your audit found false to the images"
  );
  lines.push("- Base all product descriptions on what you see in the images");
  lines.push(
    "- Any physical claim in the script you cannot see: leave it out of the visuals and list it under ---SCRIPT AUDIT--- after the prompt"
  );

  return lines.join("\n");
}

// ── Diagnostic helpers ───────────────────────────────────────

function summarizeVisionInput(
  input: VisionPromptInput,
  productTruth: ProductTruthEntry | null
): string {
  const summary: string[] = [
    `influencerCount=${resolveInfluencerImageUrls(input).length}`,
    `productCount=${input.productImageUrls.length}`,
    `scriptLength=${input.script.length}`,
    `campaign=${input.campaignType}`,
  ];

  if (input.intent) summary.push(`intent=yes`);
  if (input.productFacts) summary.push(`facts=yes`);
  if (productTruth) summary.push(`product=${productTruth.sku}`);

  return summary.join(" ");
}

// ── Error type ───────────────────────────────────────────────

export class VisionDirectorError extends Error {
  constructor(
    public code:
      | "INVALID_INPUT"
      | "EMPTY_RESPONSE"
      | "TRUNCATED_RESPONSE"
      | "API_ERROR"
      | "TIMEOUT",
    message: string
  ) {
    super(message);
    this.name = "VisionDirectorError";
  }
}
