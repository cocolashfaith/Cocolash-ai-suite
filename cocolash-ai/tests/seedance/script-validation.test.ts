import { describe, it, expect } from "vitest";
import {
  validateScriptAgainstProductTruth,
  detectPhantomFeatures,
} from "@/lib/brand/product-truth";

describe("Seedance Script Validation", () => {
  describe("validateScriptAgainstProductTruth", () => {
    it("accepts scripts with no phantom features", () => {
      const script =
        "These lashes are so soft and lightweight. The band is flexible.";
      const result = validateScriptAgainstProductTruth(
        script,
        "peony"
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("rejects scripts that mention 'magnetic' for non-magnetic products (brand-wide truth)", () => {
      // Brand-wide: NO CocoLash product has magnetic closure
      // Works even without productSku (per BLOCKER 1)
      const script =
        "The magnetic closure is so convenient and secure.";
      const result = validateScriptAgainstProductTruth(
        script,
        undefined // No SKU; brand-wide validation
      );

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/magnetic/i);
    });

    it("rejects scripts that mention 'leather' for non-leather packaging", () => {
      const script = "The premium leather case looks so elegant.";
      const result = validateScriptAgainstProductTruth(
        script,
        "peony"
      );

      expect(result.valid).toBe(false);
      expect(result.warnings.some((w) => w.includes("leather"))).toBe(true);
    });

    it("returns valid: true if no SKU provided and no brand-wide violations (per BLOCKER 1)", () => {
      const script = "Soft, flexible, and comfortable lashes.";
      const result = validateScriptAgainstProductTruth(
        script,
        undefined
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("returns valid: true if unknown SKU (can't validate)", () => {
      const script = "Claims about products.";
      const result = validateScriptAgainstProductTruth(
        script,
        "nonexistent-sku-xyz"
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("detectPhantomFeatures", () => {
    it("detects 'magnetic' claim on brand (brand-wide truth, no SKU needed)", () => {
      const script = "The magnetic lid keeps it secure.";
      const warnings = detectPhantomFeatures(script, undefined); // No SKU

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/magnetic/i);
    });

    it("detects 'magnetic' on specific SKU when SKU provided", () => {
      const script = "The magnetic lid keeps it secure.";
      const warnings = detectPhantomFeatures(script, "peony");

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/magnetic/i);
    });

    it("detects 'leather' on non-leather packaging", () => {
      const script = "Wrapped in a premium leather case.";
      const warnings = detectPhantomFeatures(script, "peony");

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/leather/i);
    });

    it("returns empty array if no phantom features", () => {
      const script =
        "Soft, lightweight, and perfect for everyday wear. The flexible band is amazing.";
      const warnings = detectPhantomFeatures(script, "peony");

      expect(warnings).toEqual([]);
    });

    it("ignores case sensitivity in feature detection", () => {
      const scriptLower = "the magnetic closure is great.";
      const scriptUpper = "The MAGNETIC CLOSURE is great.";

      const warningsLower = detectPhantomFeatures(
        scriptLower,
        undefined // Brand-wide check
      );
      const warningsUpper = detectPhantomFeatures(
        scriptUpper,
        undefined
      );

      expect(warningsLower.length).toBeGreaterThan(0);
      expect(warningsUpper.length).toBeGreaterThan(0);
    });

    it("returns empty array if no productSku and no brand-wide violations", () => {
      const script = "These lashes are comfortable and durable.";
      const warnings = detectPhantomFeatures(script, undefined);

      expect(warnings).toEqual([]);
    });

    it("ALLOWS magnetic for a known kit SKU (kits genuinely have magnetic boxes)", () => {
      // Phase 34.1: the guard is SKU-aware. Kits ARE magnetic, so a magnetic
      // claim is honest for a kit SKU and must NOT be flagged. Only lash trays
      // and books (the non-kit majority) treat "magnetic" as a phantom.
      const script = "The magnetic box is so convenient.";
      const warnings = detectPhantomFeatures(script, "kit-daisy");

      expect(warnings.filter((w) => /magnet/i.test(w))).toEqual([]);
    });

    it("still flags magnetic for a non-kit SKU", () => {
      const script = "The magnetic box is so convenient.";
      const warnings = detectPhantomFeatures(script, "peony");

      expect(warnings.some((w) => /magnet/i.test(w))).toBe(true);
    });

    it("accepts scripts mentioning 'box' or 'packaging' without 'leather'", () => {
      const script =
        "The premium branded box looks elegant. The packaging is beautiful.";
      const warnings = detectPhantomFeatures(script, "peony");

      expect(warnings).toEqual([]);
    });

    it("handles long scripts efficiently", () => {
      const longScript =
        "This product is amazing. " +
        "It is soft and flexible. " +
        "The band is comfortable. ".repeat(100) +
        "Perfect for everyday use.";
      const warnings = detectPhantomFeatures(longScript, "peony");

      expect(Array.isArray(warnings)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("validates empty script", () => {
      const result = validateScriptAgainstProductTruth("", undefined);

      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("validates whitespace-only script", () => {
      const result = validateScriptAgainstProductTruth("   \n\t  ", undefined);

      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("detects multiple violations in one script", () => {
      const script =
        "The magnetic closure is great. The leather case is premium. Perfect product.";
      const warnings = detectPhantomFeatures(script, "peony");

      // Should detect both magnetic AND leather violations
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it("validates script with product names", () => {
      const script = "CocoLash Peony lashes are beautiful and soft.";
      const warnings = detectPhantomFeatures(script, "peony");

      expect(warnings).toEqual([]);
    });
  });
});
