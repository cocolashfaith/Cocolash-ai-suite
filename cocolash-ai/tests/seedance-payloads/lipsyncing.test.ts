import { describe, it, expect } from "vitest";
import { buildEnhancorQueueRequest } from "@/lib/seedance/client";
import type { SeedanceInput } from "@/lib/seedance/types";

describe("Seedance Payloads — Lipsyncing Mode", () => {
  it("should build a valid lipsyncing payload with required fields", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "lipsyncing",
      images: ["https://example.com/avatar.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      prompt: "Avatar speaks",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    // Required fields
    expect(payload).toHaveProperty("images", ["https://example.com/avatar.jpg"]);
    expect(payload).toHaveProperty("lipsyncing_audio", "https://example.com/audio.mp3");

    // Universal fields
    expect(payload).toHaveProperty("type", "image-to-video");
    expect(payload).toHaveProperty("mode", "lipsyncing");
    expect(payload).toHaveProperty("resolution", "720p");
    expect(payload).toHaveProperty("aspect_ratio", "9:16");
    expect(payload).toHaveProperty("webhook_url", "https://example.com/webhook");
    expect(payload).toHaveProperty("duration", "10");
  });

  it("should include optional prompt, audios, and videos", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "lipsyncing",
      images: ["https://example.com/avatar.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      prompt: "Avatar speaks enthusiastically",
      audios: ["https://example.com/background.mp3"],
      videos: ["https://example.com/video.mp4"],
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: "15",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).toHaveProperty("prompt", expect.stringContaining("Avatar speaks enthusiastically"));
    expect(payload).toHaveProperty("audios", ["https://example.com/background.mp3"]);
    expect(payload).toHaveProperty("videos", ["https://example.com/video.mp4"]);
  });

  it("should NOT include products (unsupported for lipsyncing)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "lipsyncing",
      images: ["https://example.com/avatar.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      prompt: "Test",
      products: ["https://example.com/product.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("products");
  });

  it("should NOT include influencers (unsupported for lipsyncing)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "lipsyncing",
      images: ["https://example.com/avatar.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("influencers");
  });

  it("should NOT include first_frame_image (unsupported for lipsyncing)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "lipsyncing",
      images: ["https://example.com/avatar.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      prompt: "Test",
      first_frame_image: "https://example.com/frame.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("first_frame_image");
  });

  it("should NOT include last_frame_image (unsupported for lipsyncing)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "lipsyncing",
      images: ["https://example.com/avatar.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      prompt: "Test",
      last_frame_image: "https://example.com/frame.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("last_frame_image");
  });

  it("should NOT include multi_frame_prompts (unsupported for lipsyncing)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "lipsyncing",
      images: ["https://example.com/avatar.jpg"],
      lipsyncing_audio: "https://example.com/audio.mp3",
      prompt: "Test",
      multi_frame_prompts: [{ prompt: "Frame 1", duration: 5 }],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("multi_frame_prompts");
  });
});
