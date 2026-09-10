/**
 * Package A — `POST /api/scripts` is no longer blind.
 *
 * Before this fix the Seedance wizard sent only campaignType/tone/duration, so
 * the script writer fell back to the literal string "CocoLash premium false
 * lashes" and invented the rest. It now accepts the selected product images
 * (0–30 HTTPS), an optional product name and SKU, and — critically — REFUSES
 * to write an ungrounded script when analysing those images fails (G2).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as captions from "@/lib/openrouter/captions";
import * as extractor from "@/lib/ai/director/product-fact-extractor";
import * as supabaseServer from "@/lib/supabase/server";
import { POST } from "@/app/api/scripts/route";
import type { ProductFacts } from "@/lib/ai/director/product-fact-extractor";

vi.mock("@/lib/openrouter/captions", async (importOriginal) => ({
  ...(await importOriginal<typeof captions>()),
  generateVideoScript: vi.fn(),
}));
vi.mock("@/lib/ai/director/product-fact-extractor", async (importOriginal) => ({
  ...(await importOriginal<typeof extractor>()),
  extractProductFacts: vi.fn(),
}));
vi.mock("@/lib/supabase/server");

const FACTS: ProductFacts = {
  productType: "full lash kit",
  packaging: "tan rigid box with a book-style lid",
  lashStyle: "wispy clusters",
  colorsAndFinish: "tan exterior, black tray",
  visibleText: "COCOLASH",
  notableDetails: "mirror set into the inside of the lid",
  isNot: ["no glass cover", "no glass panel anywhere"],
  summary: "A tan CocoLash full kit with a fitted tray of tools.",
};

const SCRIPTS = [
  {
    hook: "h",
    body: "b",
    cta: "c",
    full_script: "h b c",
    estimated_duration: 8,
    style_match: 0.9,
  },
];

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const base = {
  campaignType: "unboxing",
  tone: "casual",
  duration: 8,
  pipeline: "seedance",
  campaignFocus: "first impressions", // skips the recent-hooks DB read
};

function images(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://cdn.test/p${i}.png`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabaseServer.createAdminClient).mockResolvedValue({} as never);
  vi.mocked(captions.generateVideoScript).mockResolvedValue(SCRIPTS);
  vi.mocked(extractor.extractProductFacts).mockResolvedValue(FACTS);
});

describe("POST /api/scripts accepts the product context", () => {
  it("grounds the script by analysing the selected product images", async () => {
    const res = await POST(
      req({ ...base, productImageUrls: images(3), productName: "CocoLash Full Kit" })
    );
    expect(res.status).toBe(200);
    expect(extractor.extractProductFacts).toHaveBeenCalledWith(images(3));

    const params = vi.mocked(captions.generateVideoScript).mock.calls[0][0];
    expect(params.productName).toBe("CocoLash Full Kit");
    expect(params.productFacts).toContain("no glass cover");
    expect(params.productFacts).toContain("WHAT THE PRODUCT ACTUALLY IS");
  });

  it("returns the facts so the wizard can reuse them in Step 3", async () => {
    const res = await POST(req({ ...base, productImageUrls: images(2) }));
    const data = await res.json();
    expect(data.productFacts).toEqual(FACTS);
  });

  it("skips re-analysis when the wizard already cached the facts", async () => {
    const res = await POST(
      req({ ...base, productImageUrls: images(4), productFacts: FACTS })
    );
    expect(res.status).toBe(200);
    expect(extractor.extractProductFacts).not.toHaveBeenCalled();
    const params = vi.mocked(captions.generateVideoScript).mock.calls[0][0];
    expect(params.productFacts).toContain("no glass cover");
  });

  it("accepts a full 30-image selection and a SKU", async () => {
    const res = await POST(
      req({ ...base, productImageUrls: images(30), productSku: "full-kit-box" })
    );
    expect(res.status).toBe(200);
    expect(extractor.extractProductFacts).toHaveBeenCalledWith(images(30));
  });

  it("rejects more than 30 product images", async () => {
    const res = await POST(req({ ...base, productImageUrls: images(31) }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/more than 30 images/i),
    });
    expect(captions.generateVideoScript).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS product image URLs", async () => {
    const res = await POST(
      req({ ...base, productImageUrls: ["http://cdn.test/p.png"] })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/HTTPS/i),
    });
    expect(captions.generateVideoScript).not.toHaveBeenCalled();
  });

  it("still writes a generic script when no product images are selected", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(200);
    expect(extractor.extractProductFacts).not.toHaveBeenCalled();
    const params = vi.mocked(captions.generateVideoScript).mock.calls[0][0];
    expect(params.productFacts).toBeUndefined();
  });
});

describe("G2 — an extraction failure surfaces, it never proceeds ungrounded", () => {
  it("returns an error instead of generating a blind script", async () => {
    vi.mocked(extractor.extractProductFacts).mockRejectedValue(
      new Error("Product fact extractor returned no content")
    );

    const res = await POST(req({ ...base, productImageUrls: images(3) }));

    expect(res.status).toBe(502);
    // The script writer must never have been reached.
    expect(captions.generateVideoScript).not.toHaveBeenCalled();

    const data = await res.json();
    expect(data.code).toBe("PRODUCT_FACTS_FAILED");
    expect(data.error).toMatch(/Could not read the selected product images/i);
    expect(data.error).toMatch(/returned no content/);
    expect(data.scripts).toBeUndefined();
  });

  it("tells the user how to proceed", async () => {
    vi.mocked(extractor.extractProductFacts).mockRejectedValue(
      new Error("upstream timeout")
    );
    const res = await POST(req({ ...base, productImageUrls: images(3) }));
    const data = await res.json();
    expect(data.error).toMatch(/deselect the product images/i);
  });
});
