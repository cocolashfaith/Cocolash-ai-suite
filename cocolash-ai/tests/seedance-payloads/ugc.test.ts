import { describe, it, expect } from "vitest";
import { buildEnhancorQueueRequest } from "@/lib/seedance/client";
import type { SeedanceInput } from "@/lib/seedance/types";

describe("Seedance Payloads — UGC Mode", () => {
  it("should build a valid ugc payload with required fields", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Creator holds and talks about CocoLash lashes",
      influencers: ["https://example.com/influencer.jpg"],
      products: ["https://example.com/product.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    // Required fields
    expect(payload).toHaveProperty("influencers", ["https://example.com/influencer.jpg"]);
    expect(payload).toHaveProperty("products", ["https://example.com/product.jpg"]);
    expect(payload).toHaveProperty("prompt", "Creator holds and talks about CocoLash lashes");

    // Universal fields
    expect(payload).toHaveProperty("type", "image-to-video");
    expect(payload).toHaveProperty("mode", "ugc");
    expect(payload).toHaveProperty("resolution", "720p");
    expect(payload).toHaveProperty("aspect_ratio", "9:16");
    expect(payload).toHaveProperty("webhook_url", "https://example.com/webhook");
    expect(payload).toHaveProperty("duration", "10");
  });

  it("should include optional audios and videos", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      products: ["https://example.com/product.jpg"],
      audios: ["https://example.com/audio.mp3"],
      videos: ["https://example.com/video.mp4"],
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: "15",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).toHaveProperty("audios", ["https://example.com/audio.mp3"]);
    expect(payload).toHaveProperty("videos", ["https://example.com/video.mp4"]);
  });

  it("should NOT include images (use influencers/products instead)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      products: ["https://example.com/product.jpg"],
      images: ["https://example.com/image.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("images");
  });

  it("should NOT include first_frame_image (unsupported for ugc)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      products: ["https://example.com/product.jpg"],
      first_frame_image: "https://example.com/frame.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("first_frame_image");
  });

  it("should NOT include last_frame_image (unsupported for ugc)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      products: ["https://example.com/product.jpg"],
      last_frame_image: "https://example.com/frame.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("last_frame_image");
  });

  it("should NOT include multi_frame_prompts (unsupported for ugc)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      products: ["https://example.com/product.jpg"],
      multi_frame_prompts: [{ prompt: "Frame 1", duration: 5 }],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("multi_frame_prompts");
  });

  it("should NOT include lipsyncing_audio (unsupported for ugc)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "ugc",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      products: ["https://example.com/product.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("lipsyncing_audio");
  });
});
