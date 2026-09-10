/**
 * Package A — the extractor now matches the picker (30 images, not 9), and the
 * client wrapper FAILS LOUDLY.
 *
 * Two independent bugs made the grounding path a no-op in production:
 *   1. MAX_IMAGES was 9 while the product picker allows 30, so selecting a 10th
 *      image 400'd and every downstream prompt lost its grounding silently.
 *   2. The wizard wrapped the call in `catch { }` and generated the script
 *      anyway — which is how a product with no glass on it was described as
 *      having "a glass cover".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("@/lib/openrouter/client", () => ({
  getOpenRouterClient: () => ({
    chat: { completions: { create: createMock } },
  }),
  openrouterRequest: <T>(fn: () => Promise<T>) => fn(),
}));

import {
  extractProductFacts,
  fetchProductFacts,
  MAX_PRODUCT_FACT_IMAGES,
  ProductFactExtractorError,
} from "@/lib/ai/director/product-fact-extractor";

const FACTS_JSON = JSON.stringify({
  productType: "full lash kit",
  packaging: "tan rigid box with a book-style lid",
  lashStyle: "wispy clusters",
  colorsAndFinish: "tan exterior, black interior",
  visibleText: "COCOLASH",
  notableDetails: "mirror set into the inside of the lid",
  isNot: ["no glass cover", "no glass panel"],
  summary: "A tan CocoLash full kit with a fitted tray of tools.",
});

function urls(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://cdn.test/p${i}.png`);
}

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue({
    choices: [{ message: { content: FACTS_JSON } }],
  });
});

describe("the extractor image cap matches the product picker", () => {
  it("is 30, not the old 9", () => {
    expect(MAX_PRODUCT_FACT_IMAGES).toBe(30);
  });

  it("accepts a full 30-image selection", async () => {
    const facts = await extractProductFacts(urls(30));
    expect(facts.productType).toBe("full lash kit");
    expect(facts.isNot).toContain("no glass cover");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("sends every one of the 30 images to the vision model", async () => {
    await extractProductFacts(urls(30));
    const content = createMock.mock.calls[0][0].messages[1].content;
    const imageParts = content.filter(
      (part: { type: string }) => part.type === "image_url"
    );
    expect(imageParts).toHaveLength(30);
  });

  it("still rejects more than 30 — and says 30 in the message", async () => {
    await expect(extractProductFacts(urls(31))).rejects.toThrow(/exceeds 30/i);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("fetchProductFacts never fails silently", () => {
  it("returns the facts on success", async () => {
    const stub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ facts: JSON.parse(FACTS_JSON) }),
    });
    const facts = await fetchProductFacts(urls(2), stub);
    expect(facts.summary).toMatch(/tan CocoLash full kit/);
    expect(stub).toHaveBeenCalledWith(
      "/api/seedance/extract-product-facts",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws with the server's message on a non-OK response", async () => {
    const stub = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Product fact extractor returned no content" }),
    });
    await expect(fetchProductFacts(urls(2), stub)).rejects.toThrow(
      /returned no content/
    );
  });

  it("throws when the response is OK but carries no facts", async () => {
    const stub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await expect(fetchProductFacts(urls(2), stub)).rejects.toBeInstanceOf(
      ProductFactExtractorError
    );
  });

  it("throws a readable error when the request itself fails", async () => {
    const stub = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    await expect(fetchProductFacts(urls(2), stub)).rejects.toThrow(
      /Could not reach the product analyser: Failed to fetch/
    );
  });

  it("never resolves to a fallback/empty facts blob on failure", async () => {
    const stub = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => null,
    });
    const result = await fetchProductFacts(urls(2), stub).catch(
      (error: unknown) => error
    );
    expect(result).toBeInstanceOf(ProductFactExtractorError);
    expect((result as Error).message).toMatch(/HTTP 502/);
  });
});
