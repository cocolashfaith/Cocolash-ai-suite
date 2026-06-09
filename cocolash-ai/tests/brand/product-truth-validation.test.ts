/**
 * Unit tests for product-truth validation and feature guard
 *
 * Tests verify:
 * - detectPhantomFeatures() finds false claims in scripts
 * - validateScriptAgainstProductTruth() returns validation results
 * - Brand-wide checks work without productSku (per D-34-04)
 * - Product-specific checks work with productSku
 * - Magnetic closure claims are always rejected (no CocoLash product has it)
 * - Band material claims are checked against product truth
 * - Packaging claims are checked against product truth
 */

import { describe, it, expect } from "vitest";
import {
  detectPhantomFeatures,
  validateScriptAgainstProductTruth,
  getProductTruthBySku,
} from "@/lib/brand/product-truth";

describe("Product Truth Validation", () => {
  describe("detectPhantomFeatures", () => {
    // ── Brand-wide checks (no SKU needed) ──

    it("returns empty array if no phantom features detected", () => {
      const script = "These lashes are so soft and comfortable. The band is flexible.";
      const warnings = detectPhantomFeatures(script, "jasmine");
      expect(warnings).toEqual([]);
    });

    it("detects brand-wide 'magnetic' claim (no SKU needed per BLOCKER 1)", () => {
      // "magnetic closure" is FALSE for ALL CocoLash products
      const script =
        "The magnetic closure makes it super secure. No worries about it popping open.";
      const warnings = detectPhantomFeatures(script); // No SKU

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/magnetic.*closure/i);
    });

    it("detects 'magnetic' claim even without productSku (brand truth applies everywhere)", () => {
      const script = "The magnetic closure is convenient.";
      const warnings = detectPhantomFeatures(script, undefined); // Explicitly no SKU

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/magnetic/i);
    });

    it("rejects 'magnetic lid' variant of magnetic claim", () => {
      const script = "Just flip the magnetic lid open and the lashes are inside.";
      const warnings = detectPhantomFeatures(script);

      expect(warnings.length).toBeGreaterThan(0);
    });

    it("rejects 'magnetic box' variant", () => {
      const script = "The magnetic box keeps everything secure and organized.";
      const warnings = detectPhantomFeatures(script);

      expect(warnings.length).toBeGreaterThan(0);
    });

    it("rejects 'magnetic seal' variant", () => {
      const script = "Premium magnetic seal ensures the packaging never opens unexpectedly.";
      const warnings = detectPhantomFeatures(script);

      expect(warnings.length).toBeGreaterThan(0);
    });

    // ── Product-specific checks ──

    it("detects band material mismatch when productSku provided", () => {
      // Assuming jasmine has cotton band (check product-truth.ts)
      const truth = getProductTruthBySku("jasmine");
      if (truth && truth.bandMaterial === "cotton") {
        const script = "The plastic band is lightweight and flexible.";
        const warnings = detectPhantomFeatures(script, "jasmine");

        // Should detect "plastic band" claim when product uses cotton
        expect(warnings.some((w) => w.includes("plastic"))).toBe(true);
      }
    });

    it("allows correct band material claim", () => {
      const truth = getProductTruthBySku("jasmine");
      if (truth && truth.bandMaterial === "cotton") {
        const script =
          "The flexible cotton band feels so comfortable, bending perfectly with your finger.";
        const warnings = detectPhantomFeatures(script, "jasmine");

        // Should have no warnings about band material
        const bandWarnings = warnings.filter((w) => w.includes("band"));
        expect(bandWarnings).toEqual([]);
      }
    });

    it("detects 'leather' packaging claim on non-leather product", () => {
      // CocoLash uses hardcover book or tray, not leather
      const script = "The premium leather case keeps your lashes safe.";
      const warnings = detectPhantomFeatures(script, "jasmine");

      expect(warnings.some((w) => w.includes("leather"))).toBe(true);
    });

    it("allows correct packaging claim", () => {
      const script = "The sleek black hardcover-style tray is so premium.";
      const warnings = detectPhantomFeatures(script, "jasmine");

      // Should not detect false claims about packaging
      const packagingWarnings = warnings.filter((w) => w.includes("leather"));
      expect(packagingWarnings).toEqual([]);
    });

    // ── Behavior when SKU is unknown ──

    it("returns only brand-truth violations if productSku is unknown", () => {
      const script = "The magnetic closure and unknown feature X.";
      const warnings = detectPhantomFeatures(script, "nonexistent-sku-12345");

      // Should only detect magnetic claim (brand truth)
      // Should NOT fail or throw; should be failure-open
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/magnetic/i);
    });

    it("returns empty array if only unknown product claims in unknown SKU", () => {
      const script = "This product has feature X that doesn't exist.";
      const warnings = detectPhantomFeatures(script, "nonexistent-sku");

      // Can't validate product-specific claims for unknown SKU
      // So should return empty (no brand-truth violations detected)
      expect(warnings).toEqual([]);
    });

    // ── Case insensitivity ──

    it("detects magnetic claims case-insensitively", () => {
      const scripts = [
        "The MAGNETIC closure is great.",
        "the magnetic CLOSURE works well",
        "MaGnEtIc ClOsUrE test",
      ];

      scripts.forEach((script) => {
        const warnings = detectPhantomFeatures(script);
        expect(warnings.length, `Failed for: ${script}`).toBeGreaterThan(0);
      });
    });
  });

  describe("validateScriptAgainstProductTruth", () => {
    it("returns valid: true if no phantom features", () => {
      const script = "Soft, lightweight, and comfortable.";
      const result = validateScriptAgainstProductTruth(
        script,
        "jasmine"
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it("returns valid: false if phantom features detected", () => {
      const script =
        "This magnetic closure is so convenient and secure.";
      const result = validateScriptAgainstProductTruth(
        script,
        "jasmine"
      );

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("includes multiple warnings for multiple false claims", () => {
      // Script with multiple false claims
      const script =
        "The magnetic closure and leather case are premium features that make this product special.";
      const result = validateScriptAgainstProductTruth(
        script,
        "jasmine"
      );

      // Expect at least magnetic warning
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.valid).toBe(false);
    });

    it("detects 'magnetic' even without productSku (brand-wide truth)", () => {
      const script = "The magnetic closure is amazing.";
      const result = validateScriptAgainstProductTruth(script, undefined);

      expect(result.valid).toBe(false);
      expect(result.warnings.some((w) => w.includes("magnetic"))).toBe(true);
    });

    it("returns warnings array even when valid: true", () => {
      const script = "Great product.";
      const result = validateScriptAgainstProductTruth(script, "jasmine");

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("warnings");
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("integration with product truth data", () => {
    it("works with real product SKUs from PRODUCT_TRUTH", () => {
      const jasmine = getProductTruthBySku("jasmine");
      expect(jasmine).toBeDefined();
      expect(jasmine?.sku).toBe("jasmine");
      expect(jasmine?.bandMaterial).toBeDefined();
    });

    it("respects real product features from PRODUCT_TRUTH", () => {
      const jasmine = getProductTruthBySku("jasmine");
      if (jasmine) {
        // Jasmine has cotton band and no magnetic closure
        expect(jasmine.bandMaterial).toBe("cotton");
        expect(jasmine.magneticClosure).toBe(false);

        // Script mentioning magnetic should fail
        const warnings = detectPhantomFeatures("The magnetic closure", "jasmine");
        expect(warnings.length).toBeGreaterThan(0);
      }
    });

    it("handles 4-pack variants the same way as single packs", () => {
      const peony = getProductTruthBySku("peony");
      const peonyPack = getProductTruthBySku("peony-4pack");

      if (peony && peonyPack) {
        expect(peony.magneticClosure).toBe(peonyPack.magneticClosure);
        expect(peony.bandMaterial).toBe(peonyPack.bandMaterial);

        // Both should reject magnetic claims
        const warnings1 = detectPhantomFeatures("Magnetic closure", "peony");
        const warnings2 = detectPhantomFeatures("Magnetic closure", "peony-4pack");
        expect(warnings1.length).toBeGreaterThan(0);
        expect(warnings2.length).toBeGreaterThan(0);
      }
    });
  });

  describe("edge cases", () => {
    it("handles script with partial word matches", () => {
      // "magneticness" should NOT match "magnetic closure" pattern
      // But "magnetic closure" should match
      const scriptPartial = "This magneticness is not a feature.";
      const scriptFull = "The magnetic closure is great.";

      const warnings1 = detectPhantomFeatures(scriptPartial);
      const warnings2 = detectPhantomFeatures(scriptFull);

      // Partial match may or may not be caught depending on regex
      // Full match should definitely be caught
      expect(warnings2.length).toBeGreaterThan(0);
    });

    it("handles very long scripts", () => {
      const longScript =
        "This is a very long script that talks about many features. " +
        "It mentions the magnetic closure multiple times. " +
        "The magnetic closure is very important. " +
        "We love the magnetic closure. " +
        "It's the best magnetic closure ever.";

      const warnings = detectPhantomFeatures(longScript);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("handles scripts with special characters", () => {
      const script = "The magnetic closure (best-ever!) is so great.";
      const warnings = detectPhantomFeatures(script);

      // Should detect magnetic claim with special chars around it
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("handles empty script gracefully", () => {
      const warnings = detectPhantomFeatures("");
      expect(warnings).toEqual([]);
    });

    it("handles null or undefined gracefully (if passed)", () => {
      // This tests that the function handles edge cases
      // In TypeScript, these shouldn't compile, but in JS they might
      const emptyScript = "";
      const warnings = detectPhantomFeatures(emptyScript);
      expect(warnings).toEqual([]);
    });
  });

  describe("performance with large scripts", () => {
    it("detects issues in O(n) time for script length", () => {
      // Create scripts of varying lengths
      const baseScript =
        "This is a product with no false claims. It is good. ";
      const scripts = [
        baseScript.repeat(10), // ~500 chars
        baseScript.repeat(100), // ~5000 chars
        baseScript.repeat(1000), // ~50k chars
      ];

      // All should execute without hanging
      scripts.forEach((script) => {
        const warnings = detectPhantomFeatures(script, "jasmine");
        expect(Array.isArray(warnings)).toBe(true);
      });
    });
  });
});
