import { describe, it, expect } from "vitest";
import { buildEnhancorQueueRequest } from "@/lib/seedance/client";
import type { SeedanceInput } from "@/lib/seedance/types";

/**
 * Phase 29 Wave 0: RED phase specs for buildEnhancorQueueRequest()
 * These tests verify per-mode payload field mapping against the Enhancor API contract.
 * RCS-03 & RCS-05 requirements: per-mode field routing is correct.
 * D-01 decision: UGC→products/influencers, Multi-Reference→images, First+Last→scalars, T2V→none.
 *
 * All tests are expected to FAIL (RED) until the resolver and client integration
 * in Wave 1 ensures resolved images are routed to the correct fields.
 */

describe("buildEnhancorQueueRequest — UGC mode payload shape (D-01, RCS-03)", () => {
  it("includes products[] when input.products is non-empty", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Creator holds and talks about CocoLash lashes",
      products: ["https://example.com/product-1.jpg", "https://example.com/product-2.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — products array present
    expect(payload).toHaveProperty("products");
    expect(payload.products).toEqual([
      "https://example.com/product-1.jpg",
      "https://example.com/product-2.jpg",
    ]);
  });

  it("includes influencers[] when input.influencers is non-empty", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — influencers array present
    expect(payload).toHaveProperty("influencers");
    expect(payload.influencers).toEqual([
      "https://example.com/influencer.jpg",
    ]);
  });

  it("does NOT include images[] (UGC uses products/influencers only, per D-01)", () => {
    // Arrange: input with all three fields
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      products: ["https://example.com/product.jpg"],
      influencers: ["https://example.com/influencer.jpg"],
      images: ["https://example.com/image.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — images field must NOT be present in UGC
    expect(payload).not.toHaveProperty("images");
  });

  it("omits products[] if array is empty, per conditional spread", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      products: [],
      influencers: ["https://example.com/influencer.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: Empty array omitted or undefined
    if (payload.hasOwnProperty("products")) {
      expect(payload.products).toEqual([]);
    } else {
      expect(payload).not.toHaveProperty("products");
    }
  });
});

describe("buildEnhancorQueueRequest — Multi-Reference mode payload shape", () => {
  it("includes images[] when input.images is non-empty", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      prompt: "A person walks through a sunlit park @image1 @image2",
      images: [
        "https://example.com/reference-1.jpg",
        "https://example.com/reference-2.jpg",
      ],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — images array present for multi_reference
    expect(payload).toHaveProperty("images");
    expect(payload.images).toEqual([
      "https://example.com/reference-1.jpg",
      "https://example.com/reference-2.jpg",
    ]);
  });

  it("does NOT include products or influencers (Multi-Reference uses images only)", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      prompt: "A person walks through a sunlit park",
      images: ["https://example.com/reference-1.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — products and influencers must NOT be present
    expect(payload).not.toHaveProperty("products");
    expect(payload).not.toHaveProperty("influencers");
  });
});

describe("buildEnhancorQueueRequest — First+Last Frames mode", () => {
  it("includes first_frame_image as a scalar string (not array)", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      prompt: "A transition from first to last",
      first_frame_image: "https://example.com/first.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — first_frame_image is a scalar string, not array
    expect(payload).toHaveProperty("first_frame_image");
    expect(payload.first_frame_image).toBe("https://example.com/first.jpg");
    expect(Array.isArray(payload.first_frame_image)).toBe(false);
  });

  it("optionally includes last_frame_image when provided", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      prompt: "A transition from first to last",
      first_frame_image: "https://example.com/first.jpg",
      last_frame_image: "https://example.com/last.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — last_frame_image is a scalar string
    expect(payload).toHaveProperty("last_frame_image");
    expect(payload.last_frame_image).toBe("https://example.com/last.jpg");
  });

  it("omits last_frame_image if not provided", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      prompt: "A transition from first to last",
      first_frame_image: "https://example.com/first.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — last_frame_image is absent when not provided
    if (payload.hasOwnProperty("last_frame_image")) {
      expect(payload.last_frame_image).toBeUndefined();
    } else {
      expect(payload).not.toHaveProperty("last_frame_image");
    }
  });
});

describe("buildEnhancorQueueRequest — Lip-Sync mode", () => {
  it("includes images[] and lipsyncing_audio", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "lipsyncing",
      prompt: "Person lip-syncs to audio",
      images: ["https://example.com/portrait.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-01 — both images and lipsyncing_audio present
    expect(payload).toHaveProperty("images");
    expect(payload.images).toEqual(["https://example.com/portrait.jpg"]);
    expect(payload).toHaveProperty("lipsyncing_audio");
    expect(payload.lipsyncing_audio).toBe("https://example.com/audio.mp3");
  });
});

describe("buildEnhancorQueueRequest — Text-to-Video mode (RCS-05)", () => {
  it("omits ALL reference image/video/audio fields per Enhancor contract", () => {
    // Arrange: Text-to-Video with no references
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "A beautiful sunset over the ocean",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: RCS-05 — no products, influencers, images, videos, audios, frames
    expect(payload).not.toHaveProperty("products");
    expect(payload).not.toHaveProperty("influencers");
    expect(payload).not.toHaveProperty("images");
    expect(payload).not.toHaveProperty("videos");
    expect(payload).not.toHaveProperty("audios");
    expect(payload).not.toHaveProperty("first_frame_image");
    expect(payload).not.toHaveProperty("last_frame_image");
  });

  it("includes type: text-to-video and prompt only", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "A beautiful sunset over the ocean",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: RCS-05 — type and prompt only, no mode or references
    expect(payload).toHaveProperty("type", "text-to-video");
    expect(payload).toHaveProperty("prompt", "A beautiful sunset over the ocean");
    expect(payload).not.toHaveProperty("mode");
  });
});

describe("buildEnhancorQueueRequest — Multi-Frame mode (D-03, best-effort)", () => {
  it("includes multi_frame_prompts[] and documents image conditioning as best-effort", () => {
    // Arrange
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_frame",
      multi_frame_prompts: [
        { prompt: "Frame 1: Product on table", duration: 5 },
        { prompt: "Frame 2: Hands holding product", duration: 5 },
      ],
      images: ["https://example.com/product.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    // Act
    const payload = buildEnhancorQueueRequest(
      input,
      "https://example.com/webhook"
    );

    // Assert: D-03 — multi_frame_prompts present; images attached defensively
    // Note: D-03 states multi-frame image support is unconfirmed. Current behavior:
    // if images are provided, they're attached defensively (harmless if ignored).
    // If Enhancor ignores them, that's confirmed in Phase 33 (VAL).
    expect(payload).toHaveProperty("multi_frame_prompts");
    expect(Array.isArray(payload.multi_frame_prompts)).toBe(true);
    if (payload.multi_frame_prompts) {
      expect(payload.multi_frame_prompts).toHaveLength(2);
    }
  });
});
