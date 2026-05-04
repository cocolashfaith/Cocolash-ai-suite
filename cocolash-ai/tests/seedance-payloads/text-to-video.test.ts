import { describe, it, expect } from "vitest";
import { buildEnhancorQueueRequest } from "@/lib/seedance/client";
import type { SeedanceInput } from "@/lib/seedance/types";

describe("Seedance Payloads — Text-to-Video Mode", () => {
  it("should build a valid text-to-video payload with required fields", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "A woman applying false lashes in front of a mirror",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    // Required fields
    expect(payload).toHaveProperty("prompt", "A woman applying false lashes in front of a mirror");

    // Universal fields
    expect(payload).toHaveProperty("type", "text-to-video");
    expect(payload).not.toHaveProperty("mode"); // text-to-video has no mode field
    expect(payload).toHaveProperty("resolution", "720p");
    expect(payload).toHaveProperty("aspect_ratio", "9:16");
    expect(payload).toHaveProperty("webhook_url", "https://example.com/webhook");
    expect(payload).toHaveProperty("duration", "10");
  });

  it("should include optional duration", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test prompt",
      duration: "15",
      aspect_ratio: "16:9",
      resolution: "1080p",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).toHaveProperty("duration", "15");
  });

  it("should NOT include images (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      images: ["https://example.com/image.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("images");
  });

  it("should NOT include videos (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      videos: ["https://example.com/video.mp4"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("videos");
  });

  it("should NOT include audios (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      audios: ["https://example.com/audio.mp3"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("audios");
  });

  it("should NOT include products (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      products: ["https://example.com/product.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("products");
  });

  it("should NOT include influencers (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("influencers");
  });

  it("should NOT include first_frame_image (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      first_frame_image: "https://example.com/frame.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("first_frame_image");
  });

  it("should NOT include last_frame_image (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      last_frame_image: "https://example.com/frame.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("last_frame_image");
  });

  it("should NOT include lipsyncing_audio (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      lipsyncing_audio: "https://example.com/audio.mp3",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("lipsyncing_audio");
  });

  it("should NOT include multi_frame_prompts (unsupported for text-to-video)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      prompt: "Test",
      multi_frame_prompts: [{ prompt: "Frame 1", duration: 5 }],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("multi_frame_prompts");
  });

  it("should NOT include mode field (text-to-video uses type only)", () => {
    const input: SeedanceInput = {
      type: "text-to-video",
      mode: "ugc",
      prompt: "Test",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("mode");
  });
});
