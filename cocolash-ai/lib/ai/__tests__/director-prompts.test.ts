/**
 * Phase 15 — Director system prompt registry sanity tests.
 *
 * These tests do NOT call the Anthropic API. They verify that:
 *   1. Every Enhancor mode has a registered system prompt
 *   2. The /admin/prompts viewer (Phase 19) sees every Director prompt
 *   3. The Director input validator rejects bad inputs
 */

import { describe, it, expect } from "vitest";
import {
  PROMPT_REGISTRY,
  getSeedanceDirectorPrompt,
} from "@/lib/ai/director/system-prompts";
import {
  runSeedanceDirector,
  SeedanceDirectorError,
} from "@/lib/ai/director/seedance-director";
import type { DirectorMode } from "@/lib/ai/director/types";

describe("Director system-prompt registry", () => {
  it("registers a system prompt for every Enhancor mode", () => {
    const modes: DirectorMode[] = [
      "ugc",
      "multi_reference",
      "multi_frame",
      "lipsyncing",
      "first_n_last_frames",
      "text_to_video",
    ];
    for (const mode of modes) {
      const { id, text } = getSeedanceDirectorPrompt(mode);
      expect(id, `mode=${mode} must have a registered prompt id`).toBeTruthy();
      expect(text.length, `mode=${mode} prompt must be non-empty`).toBeGreaterThan(
        100
      );
    }
  });

  it("includes the NanoBanana Last-Frame Director in the registry", () => {
    const entry = PROMPT_REGISTRY.find(
      (p) => p.id === "nanobanana-last-frame-director"
    );
    expect(entry, "NanoBanana Director must be registered").toBeTruthy();
    expect(entry!.surface).toMatch(/first.*last/i);
  });

  it("each prompt in the registry uses Claude Opus 4 minimum", () => {
    for (const entry of PROMPT_REGISTRY) {
      expect(
        entry.model,
        `${entry.id} must run on Opus 4.x per Faith's requirement`
      ).toMatch(/claude-opus-4/);
    }
  });

  it("each prompt cites a real source file", () => {
    for (const entry of PROMPT_REGISTRY) {
      expect(entry.filePath).toMatch(/^lib\//);
      expect(entry.filePath).toMatch(/\.ts$/);
    }
  });
});

describe("Seedance Director input validation", () => {
  it("rejects ugc mode without a composed image", async () => {
    await expect(
      runSeedanceDirector({
        mode: "ugc",
        campaignType: "product-showcase",
        tone: "casual",
        durationSeconds: 15,
        aspectRatio: "9:16",
        script: "test script",
      })
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects lipsyncing mode without audio", async () => {
    await expect(
      runSeedanceDirector({
        mode: "lipsyncing",
        campaignType: "testimonial",
        tone: "casual",
        durationSeconds: 10,
        aspectRatio: "9:16",
        script: "test",
        composedPersonProductImage: { url: "https://example.com/img.png" },
      })
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects first_n_last_frames mode without last frame", async () => {
    await expect(
      runSeedanceDirector({
        mode: "first_n_last_frames",
        campaignType: "product-showcase",
        tone: "casual",
        durationSeconds: 10,
        aspectRatio: "9:16",
        script: "test",
        firstFrameImage: { url: "https://example.com/first.png" },
      })
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects text_to_video mode without scene description", async () => {
    await expect(
      runSeedanceDirector({
        mode: "text_to_video",
        campaignType: "product-showcase",
        tone: "casual",
        durationSeconds: 5,
        aspectRatio: "16:9",
      })
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects multi_reference mode without reference images", async () => {
    await expect(
      runSeedanceDirector({
        mode: "multi_reference",
        campaignType: "product-showcase",
        tone: "casual",
        durationSeconds: 10,
        aspectRatio: "9:16",
        script: "test",
      })
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });
});
