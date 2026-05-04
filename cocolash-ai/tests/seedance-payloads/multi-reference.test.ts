import { describe, it, expect } from "vitest";
import { buildEnhancorQueueRequest } from "@/lib/seedance/client";
import type { SeedanceInput } from "@/lib/seedance/types";

describe("Seedance Payloads — Multi-Reference Mode", () => {
  it("should build a valid multi_reference payload with required fields", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      images: [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg",
      ],
      prompt: "Create a video with @image1 as the actor and @image2 as the product",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    // Required fields
    expect(payload).toHaveProperty("images");
    expect((payload as any).images).toEqual([
      "https://example.com/image1.jpg",
      "https://example.com/image2.jpg",
    ]);
    expect(payload).toHaveProperty("prompt");
    expect((payload as any).prompt).toContain("@image1");
    expect((payload as any).prompt).toContain("@image2");

    // Universal fields
    expect(payload).toHaveProperty("type", "image-to-video");
    expect(payload).toHaveProperty("mode", "multi_reference");
    expect(payload).toHaveProperty("resolution", "720p");
    expect(payload).toHaveProperty("aspect_ratio", "9:16");
    expect(payload).toHaveProperty("webhook_url", "https://example.com/webhook");
    expect(payload).toHaveProperty("duration", "10");
  });

  it("should include optional audios and videos", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      images: ["https://example.com/image.jpg"],
      prompt: "Test",
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

  it("should NOT include products (use images instead)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      images: ["https://example.com/image.jpg"],
      prompt: "Test",
      products: ["https://example.com/product.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("products");
  });

  it("should NOT include influencers (use images instead)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      images: ["https://example.com/image.jpg"],
      prompt: "Test",
      influencers: ["https://example.com/influencer.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("influencers");
  });

  it("should NOT include first_frame_image (unsupported for multi_reference)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      images: ["https://example.com/image.jpg"],
      prompt: "Test",
      first_frame_image: "https://example.com/frame.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("first_frame_image");
  });

  it("should NOT include last_frame_image (unsupported for multi_reference)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      images: ["https://example.com/image.jpg"],
      prompt: "Test",
      last_frame_image: "https://example.com/frame.jpg",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("last_frame_image");
  });

  it("should NOT include multi_frame_prompts (unsupported for multi_reference)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      images: ["https://example.com/image.jpg"],
      prompt: "Test",
      multi_frame_prompts: [{ prompt: "Frame 1", duration: 5 }],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("multi_frame_prompts");
  });

  it("should NOT include lipsyncing_audio (unsupported for multi_reference)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "multi_reference",
      images: ["https://example.com/image.jpg"],
      prompt: "Test",
      lipsyncing_audio: "https://example.com/audio.mp3",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("lipsyncing_audio");
  });
});
