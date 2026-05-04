import { describe, it, expect } from "vitest";
import { buildEnhancorQueueRequest } from "@/lib/seedance/client";
import type { SeedanceInput } from "@/lib/seedance/types";

describe("Seedance Payloads — First and Last Frame Mode", () => {
  it("should build a valid first_n_last_frames payload with required fields", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      first_frame_image: "https://example.com/first.jpg",
      last_frame_image: "https://example.com/last.jpg",
      prompt: "Smooth transition between @first_frame and @last_frame",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    // Required fields
    expect(payload).toHaveProperty("first_frame_image", "https://example.com/first.jpg");
    expect(payload).toHaveProperty("last_frame_image", "https://example.com/last.jpg");
    expect(payload).toHaveProperty("prompt");
    expect((payload as any).prompt).toContain("@first_frame");
    expect((payload as any).prompt).toContain("@last_frame");

    // Universal fields
    expect(payload).toHaveProperty("type", "image-to-video");
    expect(payload).toHaveProperty("mode", "first_n_last_frames");
    expect(payload).toHaveProperty("resolution", "720p");
    expect(payload).toHaveProperty("aspect_ratio", "9:16");
    expect(payload).toHaveProperty("webhook_url", "https://example.com/webhook");
    expect(payload).toHaveProperty("duration", "10");
  });

  it("should include optional audios and videos", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      first_frame_image: "https://example.com/first.jpg",
      last_frame_image: "https://example.com/last.jpg",
      prompt: "Transition",
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

  it("should NOT include images (use first_frame_image/last_frame_image instead)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      first_frame_image: "https://example.com/first.jpg",
      last_frame_image: "https://example.com/last.jpg",
      prompt: "Transition",
      images: ["https://example.com/image.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("images");
  });

  it("should NOT include products (unsupported for first_n_last_frames)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      first_frame_image: "https://example.com/first.jpg",
      last_frame_image: "https://example.com/last.jpg",
      prompt: "Transition",
      products: ["https://example.com/product.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("products");
  });

  it("should NOT include influencers (unsupported for first_n_last_frames)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      first_frame_image: "https://example.com/first.jpg",
      last_frame_image: "https://example.com/last.jpg",
      prompt: "Transition",
      influencers: ["https://example.com/influencer.jpg"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("influencers");
  });

  it("should NOT include multi_frame_prompts (unsupported for first_n_last_frames)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      first_frame_image: "https://example.com/first.jpg",
      last_frame_image: "https://example.com/last.jpg",
      prompt: "Transition",
      multi_frame_prompts: [{ prompt: "Frame 1", duration: 5 }],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("multi_frame_prompts");
  });

  it("should NOT include lipsyncing_audio (unsupported for first_n_last_frames)", () => {
    const input: SeedanceInput = {
      type: "image-to-video",
      mode: "first_n_last_frames",
      first_frame_image: "https://example.com/first.jpg",
      last_frame_image: "https://example.com/last.jpg",
      prompt: "Transition",
      lipsyncing_audio: "https://example.com/audio.mp3",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: "10",
    };

    const payload = buildEnhancorQueueRequest(input, "https://example.com/webhook");

    expect(payload).not.toHaveProperty("lipsyncing_audio");
  });
});
