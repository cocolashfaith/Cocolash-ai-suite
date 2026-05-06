import { describe, it, expect } from "vitest";
import { composeUserMessage } from "@/lib/ai/director/seedance-director";
import type { DirectorInput } from "@/lib/ai/director/types";

describe("Product Truth Injection", () => {
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

  it("injects product truth fields into the user message", () => {
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

    expect(msg).toContain("clusters");
    expect(msg).toContain("cotton");
    expect(msg).toContain("single-pack lash tray");
    expect(msg).toMatch(/Magnetic closure:\s*NO/i);
  });

  it("includes displayName in product truth block", () => {
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

    expect(msg).toContain("Violet");
    expect(msg).toMatch(/lash type.*clusters/i);
  });

  it("includes lengthRange when provided", () => {
    const input: DirectorInput = {
      ...baseInput,
      productTruth: {
        sku: "peony",
        displayName: "Peony",
        lashType: "clusters",
        lengthRange: "10-14mm",
        bandMaterial: "cotton",
        magneticClosure: false,
        packagingType: "single-pack lash tray",
        colorTone: "black",
        retired: false,
      },
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).toContain("10-14mm");
  });

  it("includes kit contents when product is a kit", () => {
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

    expect(msg).toContain("Lash clusters");
    expect(msg).toContain("Lash bond");
    expect(msg).toContain("Lash sealant");
  });

  it("explicitly states 'YES' for magnetic closure when true", () => {
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

    expect(msg).toMatch(/Magnetic closure:\s*YES/i);
  });

  it("does not inject product truth block when productTruth is undefined", () => {
    const input: DirectorInput = {
      ...baseInput,
    } as DirectorInput;

    const msg = composeUserMessage(input);

    expect(msg).not.toContain("PRODUCT TRUTH");
  });
});
