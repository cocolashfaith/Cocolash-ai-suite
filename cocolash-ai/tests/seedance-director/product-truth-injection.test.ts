import { describe, it, expect } from "vitest";
import { composeUserMessage } from "@/lib/ai/director/seedance-director";
import type { DirectorInput } from "@/lib/ai/director/types";

/**
 * Phase 27 contract: when productTruth is provided, composeUserMessage MUST
 * inject a canonical PRODUCT TRUTH block whose field labels follow a stable
 * format. Wave-6 (27-09, finding #4) tightened these checks from loose
 * substring matches to regex-anchored canonical-format checks so a future
 * prompt refactor that drifts the field labels (e.g. "Band:" instead of
 * "Band material:") fails CI rather than silently degrading the contract.
 */
describe("Product Truth Injection — canonical-format contract", () => {
  const baseInput: Partial<DirectorInput> = {
    mode: "ugc",
    campaignType: "product-showcase",
    tone: "casual",
    durationSeconds: 15,
    aspectRatio: "9:16",
    script: "Look at how this Jasmine cluster lash sits in its tray.",
    composedPersonProductImage: {
      url: "https://example.com/composed.jpg",
    },
  };

  it("injects the PRODUCT TRUTH header verbatim", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "jasmine",
        displayName: "Jasmine",
        lashType: "clusters",
        bandMaterial: "cotton",
        magneticClosure: false,
        packagingType: "single-pack lash tray",
        colorTone: "dark brown",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).toMatch(/PRODUCT TRUTH \(use as anchor — do not contradict\):/);
  });

  it("emits canonical 'Lash type:' label with value (and optional length range)", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "jasmine",
        displayName: "Jasmine",
        lashType: "clusters",
        lengthRange: "4-12mm",
        bandMaterial: "cotton",
        magneticClosure: false,
        packagingType: "single-pack lash tray",
        colorTone: "dark brown",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    // Anchored: must match the label-value structure, not just the word.
    expect(msg).toMatch(/^- Lash type:\s*clusters\s*\(4-12mm\)$/m);
  });

  it("emits canonical 'Band material:' label", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "violet",
        displayName: "Violet",
        lashType: "clusters",
        bandMaterial: "cotton",
        magneticClosure: false,
        packagingType: "single-pack lash tray",
        colorTone: "black",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).toMatch(/^- Band material:\s*cotton$/m);
  });

  it("emits canonical 'Packaging:' label", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "violet",
        displayName: "Violet",
        lashType: "clusters",
        bandMaterial: "cotton",
        magneticClosure: false,
        packagingType: "single-pack lash tray",
        colorTone: "black",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).toMatch(/^- Packaging:\s*single-pack lash tray$/m);
  });

  it("emits canonical 'Magnetic closure: NO — never claim magnetic' for non-magnetic products", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "violet",
        displayName: "Violet",
        lashType: "clusters",
        bandMaterial: "cotton",
        magneticClosure: false,
        packagingType: "single-pack lash tray",
        colorTone: "black",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    // Tightened: full stable phrase, not just substring "NO".
    expect(msg).toMatch(/^- Magnetic closure:\s*NO\s*—\s*never claim magnetic$/m);
  });

  it("emits canonical 'Magnetic closure: YES' for magnetic kits", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "kit-daisy",
        displayName: "Daisy Kit",
        lashType: "kit",
        bandMaterial: "none",
        magneticClosure: true,
        packagingType: "magnetic box kit",
        colorTone: "multicolor",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).toMatch(/^- Magnetic closure:\s*YES$/m);
  });

  it("emits canonical 'Display name:' label with the displayName", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "violet",
        displayName: "Violet",
        lashType: "clusters",
        bandMaterial: "cotton",
        magneticClosure: false,
        packagingType: "single-pack lash tray",
        colorTone: "black",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).toMatch(/^- Display name:\s*Violet$/m);
  });

  it("emits canonical 'Kit contents:' label with comma-separated items when product is a kit", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "kit-daisy",
        displayName: "Daisy Kit",
        lashType: "kit",
        bandMaterial: "none",
        magneticClosure: true,
        packagingType: "magnetic box kit",
        kitContents: ["Lash clusters", "Lash bond", "Lash sealant"],
        colorTone: "multicolor",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).toMatch(
      /^- Kit contents:\s*Lash clusters, Lash bond, Lash sealant$/m
    );
  });

  it("does not inject a product truth block when productTruth is undefined", () => {
    const input: DirectorInput = {
      ...baseInput,
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).not.toContain("PRODUCT TRUTH");
  });
});
