import { describe, it, expect } from "vitest";
import {
  capHashtagsForPlatform,
  PLATFORM_LIMITS,
} from "@/lib/constants/posting-times";

/**
 * Blotato rejects Instagram posts with more than 5 hashtags
 * ("Instagram allows a maximum of 5 hashtags per post"). The publisher must
 * never send more than the platform allows, regardless of how many a caption
 * carries (old captions, hand-edited ones, etc.).
 */
describe("capHashtagsForPlatform", () => {
  const many = Array.from({ length: 12 }, (_, i) => `tag${i + 1}`);

  it("caps Instagram at 5", () => {
    expect(PLATFORM_LIMITS.instagram.hashtags).toBe(5);
    const out = capHashtagsForPlatform(many, "instagram");
    expect(out).toHaveLength(5);
    expect(out).toEqual(["tag1", "tag2", "tag3", "tag4", "tag5"]);
  });

  it("caps twitter at 3", () => {
    expect(capHashtagsForPlatform(many, "twitter")).toHaveLength(3);
  });

  it("leaves a list already within the limit unchanged", () => {
    const few = ["a", "b"];
    expect(capHashtagsForPlatform(few, "instagram")).toEqual(few);
  });

  it("handles an empty list", () => {
    expect(capHashtagsForPlatform([], "instagram")).toEqual([]);
  });

  it("respects each platform's configured maximum", () => {
    for (const platform of [
      "instagram",
      "tiktok",
      "twitter",
      "facebook",
      "linkedin",
    ] as const) {
      const out = capHashtagsForPlatform(many, platform);
      expect(out.length).toBeLessThanOrEqual(PLATFORM_LIMITS[platform].hashtags);
    }
  });
});
