import { describe, it, expect } from "vitest";
import { pickRefs } from "@/app/api/seedance/generate/route";

/**
 * Regression test for the UGC "requires at least one product or influencer image"
 * 400 that occurred live: the Phase 29 wiring replaced the legacy avatar/product
 * fallback with the resolver output. For UGC the resolver's influencer list is
 * empty (the DB holds product shots, not faces), so when a SKU also resolves to no
 * product refs, the payload had NO products AND NO influencers → Enhancor 400.
 *
 * pickRefs encodes the correct 3-tier fallback. These assertions would have failed
 * before the fix.
 */
describe("pickRefs — 3-tier reference fallback (regression: UGC avatar must survive)", () => {
  const AVATAR = "https://cdn/avatar-ugc.jpg";
  const PRODUCT = "https://cdn/product.jpg";
  const DB = ["https://db/ref-1.jpg", "https://db/ref-2.jpg"];

  it("request-body refs win when provided", () => {
    expect(pickRefs(["https://body/x.jpg"], DB, AVATAR)).toEqual(["https://body/x.jpg"]);
  });

  it("falls back to DB-resolved refs when body is empty (Phase 29 conditioning)", () => {
    expect(pickRefs(undefined, DB, AVATAR)).toEqual(DB);
    expect(pickRefs([], DB, AVATAR)).toEqual(DB);
  });

  it("falls back to the legacy single image (avatar/product) when body AND DB are empty", () => {
    // THE REGRESSION: UGC influencers resolve empty from the DB → must use the avatar.
    expect(pickRefs(undefined, [], AVATAR)).toEqual([AVATAR]);
    expect(pickRefs([], [], PRODUCT)).toEqual([PRODUCT]);
  });

  it("returns [] only when every source is empty", () => {
    expect(pickRefs(undefined, [], undefined)).toEqual([]);
    expect(pickRefs([], [], undefined)).toEqual([]);
  });

  it("UGC scenario: empty influencer DB refs + an avatar => influencers is never empty", () => {
    // Mirrors the live failure: resolver returns influencerImages=[] for UGC,
    // personImageUrl is the generated avatar.
    const resolvedInfluencerImages: string[] = [];
    const personImageUrl = AVATAR;
    const finalInfluencers = pickRefs(undefined, resolvedInfluencerImages, personImageUrl);
    expect(finalInfluencers.length).toBeGreaterThan(0);
    expect(finalInfluencers).toEqual([AVATAR]);
  });

  it("UGC scenario: SKU with DB product refs => products carry the DB conditioning images", () => {
    const finalProducts = pickRefs(undefined, DB, PRODUCT);
    expect(finalProducts).toEqual(DB); // DB refs preferred over the legacy single image
  });
});
