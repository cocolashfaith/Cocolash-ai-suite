/**
 * Package A — "Generate holding the product" (H1–H3) + the mixed-identity
 * guard (F7). See docs/seedance-2.5/06-QUALITY-PASS.md.
 *
 * There is no DOM in this suite (vitest runs `environment: "node"`), so the
 * decision logic lives in exported pure helpers that are unit-tested here, and
 * the wiring those helpers feed is asserted against the component source — the
 * same approach as tests/components/seedance/ProductReferencePicker.test.ts.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAvatarRequestBody,
  checkComposedProductFacts,
  composeProductDescription,
  composedFirst,
  composedProductContradiction,
  mixedIdentityWarning,
  COMPOSE_FACT_WARNING,
  DEFAULT_COMPOSE_PRODUCT_DESCRIPTION,
  MIXED_IDENTITY_WARNING,
  type InfluencerRef,
} from "@/components/video/seedance-v4/modes/UgcMode";
import type { ProductFacts } from "@/lib/ai/director/product-fact-extractor";

const ROOT = resolve(__dirname, "../../..");
const source = readFileSync(
  resolve(ROOT, "components/video/seedance-v4/modes/UgcMode.tsx"),
  "utf8"
);

const LOOK = {
  ethnicity: "Latina",
  skinTone: "Medium",
  ageRange: "25-34",
  hairStyle: "Wavy",
  scene: "casual-bedroom",
  vibe: "excited-discovery",
  lashStyle: "natural",
  aspectRatio: "9:16",
} as const;

function facts(patch: Partial<ProductFacts> = {}): ProductFacts {
  return {
    productType: "full lash kit",
    packaging: "tan book-style box with a black wordmark",
    lashStyle: "wispy clusters",
    colorsAndFinish: "tan board, black print",
    visibleText: "COCOLASH",
    notableDetails: "mirror set into the lid, fitted tray of tools",
    isNot: ["no glass cover", "no magnetic closure on the lash case"],
    summary: "A tan CocoLash full kit box with a mirrored lid and a fitted tool tray.",
    ...patch,
  };
}

// ── H1: the toggle's payload ─────────────────────────────────

describe("H1 — buildAvatarRequestBody (compose toggle wiring)", () => {
  it("sends hasProduct:false and NO productImageUrl when the toggle is off", () => {
    const body = buildAvatarRequestBody({
      ...LOOK,
      composeEnabled: false,
      productImageUrls: ["https://cdn.example.com/kit-1.png"],
      productFacts: facts(),
    });
    expect(body.hasProduct).toBe(false);
    expect("productImageUrl" in body).toBe(false);
    expect("productDescription" in body).toBe(false);
  });

  it("sends the FIRST product image + hasProduct:true when the toggle is on", () => {
    const body = buildAvatarRequestBody({
      ...LOOK,
      composeEnabled: true,
      productImageUrls: [
        "https://cdn.example.com/kit-1.png",
        "https://cdn.example.com/kit-2.png",
      ],
      productFacts: facts(),
    });
    expect(body.hasProduct).toBe(true);
    expect(body.productImageUrl).toBe("https://cdn.example.com/kit-1.png");
    expect(body.productDescription).toContain("full lash kit");
  });

  it("stays uncomposed when the toggle is on but Step 1 selected nothing", () => {
    const body = buildAvatarRequestBody({
      ...LOOK,
      composeEnabled: true,
      productImageUrls: [],
    });
    expect(body.hasProduct).toBe(false);
    expect("productImageUrl" in body).toBe(false);
  });

  it("always carries the look traits and aspect ratio", () => {
    const body = buildAvatarRequestBody({ ...LOOK, composeEnabled: false });
    expect(body.ethnicity).toBe("Latina");
    expect(body.lashStyle).toBe("natural");
    expect(body.aspectRatio).toBe("9:16");
  });

  it("never sends a blank productDescription (the route 400s on that)", () => {
    const body = buildAvatarRequestBody({
      ...LOOK,
      composeEnabled: true,
      productImageUrls: ["https://cdn.example.com/kit-1.png"],
      productFacts: undefined,
    });
    expect(body.hasProduct).toBe(true);
    expect(body.productDescription).toBe(DEFAULT_COMPOSE_PRODUCT_DESCRIPTION);
  });
});

describe("composeProductDescription", () => {
  it("prefers a holdable noun phrase from productType + packaging", () => {
    expect(composeProductDescription(facts())).toBe(
      "the full lash kit (tan book-style box with a black wordmark)"
    );
  });

  it("falls back to the summary when the structured fields are empty", () => {
    const f = facts({ productType: "", packaging: "", summary: "A tan kit box." });
    expect(composeProductDescription(f)).toBe("A tan kit box.");
  });

  it("falls back to the default when there are no facts at all", () => {
    expect(composeProductDescription(undefined)).toBe(
      DEFAULT_COMPOSE_PRODUCT_DESCRIPTION
    );
  });

  it("truncates a runaway description", () => {
    const f = facts({ productType: "x".repeat(400), packaging: "" });
    expect(composeProductDescription(f).length).toBeLessThanOrEqual(241);
  });
});

// ── H2: composed-first ordering ──────────────────────────────

describe("H2 — composedFirst", () => {
  it("puts the composed shot at index 0 and keeps the rest in order", () => {
    expect(composedFirst(["a", "b"], "c", 10)).toEqual(["c", "a", "b"]);
  });

  it("promotes an already-selected composed shot instead of duplicating it", () => {
    expect(composedFirst(["a", "c", "b"], "c", 10)).toEqual(["c", "a", "b"]);
  });

  it("respects the combined reference cap", () => {
    expect(composedFirst(["a", "b", "c"], "z", 2)).toEqual(["z", "a"]);
  });

  it("never drops the composed shot, even at a zero cap", () => {
    expect(composedFirst(["a"], "z", 0)).toEqual(["z"]);
  });
});

describe("H2 — Continue wiring (component source)", () => {
  it("sets ugcWasComposed from composed provenance, not a constant false", () => {
    // TRUE for a freshly-approved composed shot AND for a gallery pick that
    // was composed in an earlier session (tag `ugc-avatar-composed`).
    expect(source).toContain("ugcWasComposed: hasComposedRef");
    expect(source).toContain("composedGalleryUrls.has(u)");
    expect(source).not.toContain("ugcWasComposed: false");
  });

  it("keeps ugcInfluencerImageUrl mirroring entry [0]", () => {
    expect(source).toContain("ugcInfluencerImageUrl: ordered[0]");
    expect(source).toContain("ugcInfluencerImageUrl: merged[0]");
  });

  it("keeps the legacy single-image compose field cleared (vision path stays on)", () => {
    expect(source).toContain("ugcComposedImageUrl: undefined");
  });

  it("never writes ugcProductImageUrls from Step 2", () => {
    expect(source).not.toContain("ugcProductImageUrls:");
  });
});

// ── H3(b): the product fact check ────────────────────────────

describe("H3(b) — composedProductContradiction", () => {
  it("is silent when the composed product matches the real references", () => {
    expect(composedProductContradiction(facts(), facts())).toBeNull();
  });

  it("flags a feature the real references explicitly list as absent", () => {
    const composed = facts({
      isNot: [],
      notableDetails: "a glass cover over the tray",
    });
    const reason = composedProductContradiction(facts(), composed);
    expect(reason).toContain("glass cover");
  });

  it("flags an invented closure the real references never show", () => {
    const real = facts({ isNot: [], notableDetails: "fitted tray of tools" });
    const composed = facts({
      isNot: [],
      notableDetails: "a magnetic clasp holds the lid shut",
    });
    expect(composedProductContradiction(real, composed)).toContain("magnetic");
  });

  it("flags a completely different packaging type", () => {
    const real = facts({
      isNot: [],
      productType: "lash kit",
      packaging: "tan box",
      notableDetails: "",
      colorsAndFinish: "",
      summary: "",
    });
    const composed = facts({
      isNot: [],
      productType: "lash serum",
      packaging: "black tube",
      notableDetails: "",
      colorsAndFinish: "",
      summary: "",
    });
    expect(composedProductContradiction(real, composed)).toContain("tube");
  });

  it("returns null when either side is missing (best-effort, never noisy)", () => {
    expect(composedProductContradiction(undefined, facts())).toBeNull();
    expect(composedProductContradiction(facts(), undefined)).toBeNull();
  });
});

describe("H3(b) — checkComposedProductFacts", () => {
  const COMPOSED = "https://cdn.example.com/composed.png";

  it("warns when the injected extractor contradicts the cached facts", async () => {
    const contradicting = facts({
      isNot: [],
      notableDetails: "a glass cover over the tray",
    });
    const reason = await checkComposedProductFacts(COMPOSED, facts(), async (urls) => {
      expect(urls).toEqual([COMPOSED]);
      return contradicting;
    });
    expect(reason).toContain("glass cover");
  });

  it("stays silent when the composed product agrees", async () => {
    const reason = await checkComposedProductFacts(
      COMPOSED,
      facts(),
      async () => facts()
    );
    expect(reason).toBeNull();
  });

  it("swallows extractor failures — no warning, no crash", async () => {
    const reason = await checkComposedProductFacts(COMPOSED, facts(), async () => {
      throw new Error("extractor 500");
    });
    expect(reason).toBeNull();
  });

  it("does nothing when no real facts were cached", async () => {
    let called = false;
    const reason = await checkComposedProductFacts(COMPOSED, undefined, async () => {
      called = true;
      return facts();
    });
    expect(reason).toBeNull();
    expect(called).toBe(false);
  });
});

describe("H3(a) — the composed image is approved, never auto-selected", () => {
  it("routes composed results into a kept attempts strip rather than the selection", () => {
    expect(source).toContain("setSelectedComposedUrl(data.imageUrl)");
    expect(source).toContain("handleApproveComposed");
    // Attempts APPEND — regenerating must never wipe earlier attempts.
    expect(source).toContain(
      "{ url: data.imageUrl, warning: null, checking: true },"
    );
    expect(source).not.toContain("setComposedAttempts([]);\n    try {");
  });

  it("labels the preview as holding the product and offers a regenerate", () => {
    expect(source).toContain("holding product");
    expect(source).toContain("Regenerate");
  });

  it("lets the user discard ONE attempt while keeping the rest", () => {
    expect(source).toContain("handleDiscardAttempt");
    expect(source).toContain(
      "composedAttempts.filter((a) => a.url !== selectedAttempt.url)"
    );
  });

  it("marks composed gallery avatars so a later session can reuse them", () => {
    expect(source).toContain('includes("ugc-avatar-composed")');
  });

  it("never hard-blocks on the fact-check warning", () => {
    expect(COMPOSE_FACT_WARNING).toContain("continue anyway");
    // canContinue is unchanged by compose state.
    expect(source).toContain(
      "const canContinue = influencers.length > 0 && productCount >= 1;"
    );
  });
});

// ── F7: mixed-identity guard ─────────────────────────────────

describe("F7 — mixedIdentityWarning", () => {
  const gen = (url: string, batchId: string): InfluencerRef => ({
    url,
    origin: "generated",
    batchId,
  });

  it("says nothing for a single reference", () => {
    expect(mixedIdentityWarning([gen("a", "b1")])).toBeNull();
  });

  it("says nothing for several images out of the SAME generate batch", () => {
    expect(mixedIdentityWarning([gen("a", "b1"), gen("b", "b1")])).toBeNull();
  });

  it("warns across two separate generate runs (two different faces)", () => {
    expect(mixedIdentityWarning([gen("a", "b1"), gen("b", "b2")])).toBe(
      MIXED_IDENTITY_WARNING
    );
  });

  it("warns when a gallery pick joins a generated avatar", () => {
    expect(
      mixedIdentityWarning([gen("a", "b1"), { url: "b", origin: "gallery" }])
    ).toBe(MIXED_IDENTITY_WARNING);
  });

  it("warns when uploads are mixed in", () => {
    expect(
      mixedIdentityWarning([
        { url: "a", origin: "upload" },
        { url: "b", origin: "upload" },
      ])
    ).toBe(MIXED_IDENTITY_WARNING);
  });

  it("is honest about what it is: provenance, not face recognition", () => {
    expect(MIXED_IDENTITY_WARNING).toContain("one identity works best");
    expect(source).not.toMatch(/face(Recognition|Match|Embedding)/i);
  });
});

// ── H1: the toggle itself ────────────────────────────────────

describe("H1 — the toggle in the Generate tab (component source)", () => {
  it("renders an accessible switch bound to ugcComposeEnabled", () => {
    expect(source).toContain('role="switch"');
    expect(source).toContain("ugcComposeEnabled");
    expect(source).toContain('aria-label="Generate holding the product"');
  });

  it("defaults ON (H5 — flipped after the 2026-09-16 A/B win)", () => {
    expect(source).toContain("state.ugcComposeEnabled ?? true");
    expect(source).not.toContain("state.ugcComposeEnabled ?? false");
  });

  it("is disabled with a hint until Step 1 has product images", () => {
    expect(source).toContain("Pick product images in Step 1 first");
    expect(source).toContain("disabled={!canCompose}");
  });
});
