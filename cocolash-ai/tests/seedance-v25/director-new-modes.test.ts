/**
 * Package F — Director support for the three new Seedance 2.5 modes
 * (edit / extend / voice_clone) plus Auto duration in the user message.
 *
 * No LLM is called: every assertion here hits validation, the prompt registry
 * or the pure `composeUserMessage` composer.
 */

import { describe, it, expect } from "vitest";
import {
  PROMPT_REGISTRY,
  getSeedanceDirectorPrompt,
} from "@/lib/ai/director/system-prompts";
import {
  composeUserMessage,
  runSeedanceDirector,
  SeedanceDirectorError,
} from "@/lib/ai/director/seedance-director";
import type { DirectorInput } from "@/lib/ai/director/types";
import { SEEDANCE_25_MODES } from "@/lib/seedance/v25/types";

const VIDEO = "https://example.com/source.mp4";
const AUDIO = "https://example.com/voice.mp3";
const IMAGE = "https://example.com/speaker.png";

function base(overrides: Partial<DirectorInput>): DirectorInput {
  return {
    mode: "ugc",
    campaignType: "product-showcase",
    tone: "casual",
    durationSeconds: 8,
    aspectRatio: "9:16",
    ...overrides,
  } as DirectorInput;
}

describe("system-prompt registry covers all nine 2.5 modes", () => {
  it("has a non-empty prompt for every mode", () => {
    for (const mode of SEEDANCE_25_MODES) {
      const { id, text } = getSeedanceDirectorPrompt(mode);
      expect(id, `mode=${mode} needs a prompt id`).toBeTruthy();
      expect(text.length, `mode=${mode} prompt must be substantial`).toBeGreaterThan(200);
    }
  });

  it("registers the three new modes by id", () => {
    for (const id of [
      "seedance-director-edit",
      "seedance-director-extend",
      "seedance-director-voice-clone",
    ]) {
      const entry = PROMPT_REGISTRY.find((p) => p.id === id);
      expect(entry, `${id} must be in PROMPT_REGISTRY`).toBeTruthy();
      expect(entry!.surface).toMatch(/Step 3/);
    }
  });

  it("still throws for an unknown mode", () => {
    expect(() =>
      getSeedanceDirectorPrompt("not_a_mode" as never)
    ).toThrowError(/No system prompt/);
  });

  it("edit and extend prompts reference the source clip token", () => {
    expect(getSeedanceDirectorPrompt("edit").text).toContain("@video1");
    expect(getSeedanceDirectorPrompt("extend").text).toContain("@video1");
  });

  it("voice_clone prompt points the voice at the audio, not at description", () => {
    const text = getSeedanceDirectorPrompt("voice_clone").text;
    expect(text).toContain("@audio1");
    expect(text).toMatch(/do not describe the voice/i);
  });

  it("text_to_video prompt still forbids image references", () => {
    expect(getSeedanceDirectorPrompt("text_to_video").text).toMatch(
      /NO reference images/i
    );
  });
});

describe("validateDirectorInput — new modes", () => {
  it("rejects edit without a source video", async () => {
    await expect(
      runSeedanceDirector(
        base({ mode: "edit", durationSeconds: -1, editInstruction: "make it night" })
      )
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects edit without an instruction", async () => {
    await expect(
      runSeedanceDirector(
        base({ mode: "edit", durationSeconds: -1, sourceVideoUrls: [VIDEO] })
      )
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects extend without a source video", async () => {
    await expect(
      runSeedanceDirector(base({ mode: "extend", durationSeconds: 8 }))
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects voice_clone without audio", async () => {
    await expect(
      runSeedanceDirector(
        base({ mode: "voice_clone", composedPersonProductImage: { url: IMAGE } })
      )
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects voice_clone without a speaker image", async () => {
    await expect(
      runSeedanceDirector(
        base({ mode: "voice_clone", referenceAudioUrl: AUDIO })
      )
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("rejects a duration below the 2.5 minimum of 4 s", async () => {
    await expect(
      runSeedanceDirector(
        base({ mode: "text_to_video", durationSeconds: 3, sceneDescription: "a scene" })
      )
    ).rejects.toBeInstanceOf(SeedanceDirectorError);
  });

  it("accepts 4 s (no longer requires 5 s)", () => {
    const msg = composeUserMessage(
      base({ mode: "text_to_video", durationSeconds: 4, sceneDescription: "a scene" })
    );
    expect(msg).toContain("4s");
  });
});

describe("composeUserMessage — new modes and Auto duration", () => {
  it("lists @video1 sources and the edit instruction", () => {
    const msg = composeUserMessage(
      base({
        mode: "edit",
        durationSeconds: -1,
        sourceVideoUrls: [VIDEO],
        editInstruction: "swap the background for a bathroom counter",
      })
    );
    expect(msg).toContain("@video1");
    expect(msg).toContain(VIDEO);
    expect(msg).toContain("swap the background for a bathroom counter");
  });

  it("says Auto (and the ~10 s planning assumption) when durationSeconds is -1", () => {
    const msg = composeUserMessage(
      base({
        mode: "edit",
        durationSeconds: -1,
        sourceVideoUrls: [VIDEO],
        editInstruction: "make it night",
      })
    );
    expect(msg).toMatch(/Total duration: Auto/);
    expect(msg).toContain("~10 s");
  });

  it("describes the clip to continue for extend", () => {
    const msg = composeUserMessage(
      base({
        mode: "extend",
        durationSeconds: 12,
        sourceVideoUrls: [VIDEO, "https://example.com/b.mp4"],
        editInstruction: "keep walking toward the mirror",
      })
    );
    expect(msg).toContain("@video1");
    expect(msg).toContain("@video2");
    expect(msg).toContain("keep walking toward the mirror");
  });

  it("names the speaker image and @audio1 for voice_clone", () => {
    const msg = composeUserMessage(
      base({
        mode: "voice_clone",
        composedPersonProductImage: { url: IMAGE },
        referenceAudioUrl: AUDIO,
      })
    );
    expect(msg).toContain(IMAGE);
    expect(msg).toContain("@audio1");
    expect(msg).toContain(AUDIO);
  });

  it("plans multi_frame segments at 3-8 s within a 4-30 s total", () => {
    const msg = composeUserMessage(
      base({
        mode: "multi_frame",
        durationSeconds: 24,
        multiFrameSegmentCount: 6,
        script: "hi",
        subjectBrief: "Black woman, 30s, natural curls, holding CocoLash Violet",
      })
    );
    expect(msg).toContain("6 segments");
    expect(msg).toContain("24s");
    expect(msg).toContain("3-8s");
  });
});
