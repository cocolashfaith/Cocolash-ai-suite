import { describe, it, expect } from "vitest";
import { buildEnhancorQueueRequest } from "@/lib/seedance/client";
import type { SeedanceInput } from "@/lib/seedance/types";

describe("Seedance Payloads — Multi-Frame Mode", () => {
  it("should build a valid multi_frame payload with required fields", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_frame",
      multi_frame_prompts: [
        { prompt: "Wide shot of woman applying lashes", duration: 5 },
        { prompt: "Close-up of lash placement", duration: 5 },
      ],
      prompt: "Dummy prompt",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    // Required fields must be present
    expect(payload).toHaveProperty("multi_frame_prompts");
    expect(payload.multi_frame_prompts).toEqual([
      { prompt: "Wide shot of woman applying lashes", duration: 5 },
      { prompt: "Close-up of lash placement", duration: 5 },
    ]);

    // Universal fields must be present
    expect(payload).toHaveProperty("type", "image-to-video");
    expect(payload).toHaveProperty("mode", "multi_frame");
    expect(payload).toHaveProperty("resolution", "720p");
    expect(payload).toHaveProperty("aspect_ratio", "9:16");
    expect(payload).toHaveProperty("webhook_url", "https://example.com/webhook");
  });

  it("should include optional videos and audios", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_frame",
      multi_frame_prompts: [{ prompt: "Test shot", duration: 5 }],
      prompt: "Dummy",
      videos: ["https://example.com/video.mp4"],
      audios: ["https://example.com/audio.mp3"],
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: "5",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).toHaveProperty("videos", ["https://example.com/video.mp4"]);
    expect(payload).toHaveProperty("audios", ["https://example.com/audio.mp3"]);
  });

  it("should NOT include images (unsupported for multi_frame)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_frame",
      multi_frame_prompts: [{ prompt: "Test", duration: 5 }],
      prompt: "Dummy",
      images: ["https://example.com/image.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("images");
  });

  it("should NOT include products (unsupported for multi_frame)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_frame",
      multi_frame_prompts: [{ prompt: "Test", duration: 5 }],
      prompt: "Dummy",
      products: ["https://example.com/product.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("products");
  });

  it("should NOT include influencers (unsupported for multi_frame)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_frame",
      multi_frame_prompts: [{ prompt: "Test", duration: 5 }],
      prompt: "Dummy",
      influencers: ["https://example.com/influencer.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("influencers");
  });

  it("should NOT include top-level prompt (unsupported for multi_frame)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_frame",
      prompt: "This should be ignored",
      multi_frame_prompts: [{ prompt: "Test", duration: 5 }],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("prompt");
  });

  it("should NOT include top-level duration (unsupported for multi_frame)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_frame",
      multi_frame_prompts: [{ prompt: "Test", duration: 5 }],
      prompt: "Dummy",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "5",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("duration");
  });
});
