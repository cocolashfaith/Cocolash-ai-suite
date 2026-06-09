/**
 * Product Fact Extractor — "extract once, reuse twice" (Phase 34.1 R-34.1-04).
 *
 * Runs ONE vision pass over the selected product images and returns a small,
 * structured, honest fact blob: what the product IS, its packaging, the visible
 * lash style, colours, legible text, and — critically — what it is NOT (e.g. no
 * magnetic closure). The blob is cached in wizard state and fed to BOTH:
 *   (a) the script generator (so the script is grounded in the real product), and
 *   (b) the Step-3 Seedance prompt agent (so script and prompt share one source
 *       of truth and can't drift).
 *
 * This avoids doing a separate vision call just to write the script: facts are
 * extracted once, then reused as plain text everywhere.
 *
 * Model: Claude Opus 4.7 (vision) via the project's OpenRouter client — the same
 * model the Seedance Vision Director uses.
 */

import { getOpenRouterClient, openrouterRequest } from "@/lib/openrouter/client";

export const PRODUCT_FACT_EXTRACTOR_MODEL = "anthropic/claude-opus-4.7";

/**
 * Structured, image-derived product facts. Every field is plain text so the
 * blob serialises cleanly into wizard state and into downstream prompts.
 */
export interface ProductFacts {
  /** What the product is, e.g. "multi-lash book of cluster lashes". */
  productType: string;
  /** Packaging style seen in the images, e.g. "black book-style box". */
  packaging: string;
  /** Visible lash style, e.g. "wispy criss-cross clusters". */
  lashStyle: string;
  /** Colours / finish, e.g. "matte black with rose-gold lettering, blush tray". */
  colorsAndFinish: string;
  /** Legible text on the packaging, e.g. "COCOLASH". Empty if none legible. */
  visibleText: string;
  /** Other notable physical details (counts, inserts, storage case, etc.). */
  notableDetails: string;
  /** Features that are visibly ABSENT and must NOT be claimed (honesty guard). */
  isNot: string[];
  /** One- to two-sentence honest summary of the product. */
  summary: string;
}

export class ProductFactExtractorError extends Error {
  constructor(
    public code: "INVALID_INPUT" | "EMPTY_RESPONSE",
    message: string
  ) {
    super(message);
    this.name = "ProductFactExtractorError";
  }
}

const MAX_IMAGES = 9;

function validate(imageUrls: string[]): void {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new ProductFactExtractorError(
      "INVALID_INPUT",
      "productImageUrls must be a non-empty array"
    );
  }
  if (imageUrls.length > MAX_IMAGES) {
    throw new ProductFactExtractorError(
      "INVALID_INPUT",
      `productImageUrls exceeds ${MAX_IMAGES} images`
    );
  }
  for (const url of imageUrls) {
    if (!url.startsWith("https://")) {
      throw new ProductFactExtractorError(
        "INVALID_INPUT",
        `Image URL must be HTTPS: ${url.substring(0, 50)}...`
      );
    }
  }
}

/**
 * Extract structured product facts from the selected product images.
 * One vision call; the result is meant to be cached and reused.
 */
export async function extractProductFacts(
  imageUrls: string[]
): Promise<ProductFacts> {
  validate(imageUrls);
  const raw = await callFactsModel(
    buildFactsSystemPrompt(),
    buildFactsUserPrompt(),
    imageUrls
  );
  return parseProductFacts(raw);
}

// ── Model call ───────────────────────────────────────────────

/** Thin OpenRouter vision call. Mockable in tests. */
export async function callFactsModel(
  systemPrompt: string,
  userPrompt: string,
  imageUrls: string[]
): Promise<string> {
  const client = getOpenRouterClient();
  const imageParts = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));

  const completion = await openrouterRequest(() =>
    client.chat.completions.create({
      model: PRODUCT_FACT_EXTRACTOR_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [...imageParts, { type: "text" as const, text: userPrompt }],
        },
      ],
    })
  );

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    throw new ProductFactExtractorError(
      "EMPTY_RESPONSE",
      "Product fact extractor returned no content"
    );
  }
  return raw;
}

// ── Prompts ──────────────────────────────────────────────────

function buildFactsSystemPrompt(): string {
  return `You are a meticulous product analyst for CocoLash (a false-lash brand).

You will be shown 1–9 images of a SINGLE product (often different angles). Report ONLY what you can actually see. Do not guess, embellish, or import features from other CocoLash products.

Honesty rules:
- If a feature is not visibly present, do NOT claim it.
- CocoLash lash trays and multi-lash books do NOT have magnetic closures — only the full kits do. If you do not clearly see a magnet/magnetic closure, list "no magnetic closure" under what it is NOT.
- Bands are flexible (not rigid plastic) unless the image clearly shows otherwise.
- Only report packaging text you can actually read.

Return ONLY valid JSON (no markdown, no prose) in exactly this shape:
{
  "productType": "what the product is",
  "packaging": "packaging style you see",
  "lashStyle": "visible lash style/shape",
  "colorsAndFinish": "colours and finish",
  "visibleText": "legible text on packaging, or empty string",
  "notableDetails": "other visible details (counts, tray, storage case, inserts)",
  "isNot": ["features that are visibly absent and must not be claimed"],
  "summary": "one or two honest sentences describing the product"
}`;
}

function buildFactsUserPrompt(): string {
  return "Analyze this CocoLash product from the attached image(s) and return the JSON fact sheet.";
}

// ── Parsing & formatting ─────────────────────────────────────

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Lenient parse: accepts raw JSON or fenced JSON. If the model returns
 * non-JSON prose, degrades gracefully to a facts blob whose `summary` carries
 * the text (so grounding still happens) rather than throwing.
 */
export function parseProductFacts(raw: string): ProductFacts {
  let cleaned = raw.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  const empty: ProductFacts = {
    productType: "",
    packaging: "",
    lashStyle: "",
    colorsAndFinish: "",
    visibleText: "",
    notableDetails: "",
    isNot: [],
    summary: "",
  };

  try {
    const data = JSON.parse(cleaned) as Record<string, unknown>;
    const isNotRaw = data.isNot;
    const isNot = Array.isArray(isNotRaw)
      ? isNotRaw.map(asString).filter(Boolean)
      : asString(isNotRaw)
        ? [asString(isNotRaw)]
        : [];
    return {
      productType: asString(data.productType),
      packaging: asString(data.packaging),
      lashStyle: asString(data.lashStyle),
      colorsAndFinish: asString(data.colorsAndFinish),
      visibleText: asString(data.visibleText),
      notableDetails: asString(data.notableDetails),
      isNot,
      summary: asString(data.summary),
    };
  } catch {
    // Non-JSON response — keep the text as the summary so the script generator
    // still gets image-grounded context instead of nothing.
    return { ...empty, summary: raw.trim().slice(0, 600) };
  }
}

/**
 * Render the cached facts into a prompt block used by both the script generator
 * and the Step-3 prompt agent. Returns "" if there's nothing usable.
 */
export function formatProductFactsForPrompt(facts: ProductFacts): string {
  const hasContent = Boolean(
    facts.productType ||
      facts.packaging ||
      facts.lashStyle ||
      facts.colorsAndFinish ||
      facts.notableDetails ||
      facts.isNot.length ||
      facts.summary
  );
  if (!hasContent) return "";

  const lines: string[] = [];
  if (facts.productType) lines.push(`- Product: ${facts.productType}`);
  if (facts.packaging) lines.push(`- Packaging: ${facts.packaging}`);
  if (facts.lashStyle) lines.push(`- Lash style: ${facts.lashStyle}`);
  if (facts.colorsAndFinish) lines.push(`- Colours / finish: ${facts.colorsAndFinish}`);
  lines.push(
    `- Visible packaging text: ${facts.visibleText || "(none legible)"}`
  );
  if (facts.notableDetails) lines.push(`- Notable details: ${facts.notableDetails}`);
  if (facts.isNot.length > 0) {
    lines.push(`- Do NOT claim (not present in the images): ${facts.isNot.join("; ")}`);
  }

  const body = lines.join("\n");

  return `WHAT THE PRODUCT ACTUALLY IS (analyzed from its own images — this is the source of truth):
${body}${facts.summary ? `\nSummary: ${facts.summary}` : ""}

Ground every product reference in these facts. Where they conflict with any generic brand description, THESE facts win (especially packaging and closures). Do not invent features that aren't listed here.`;
}
