import { describe, it, expect } from "vitest";
import {
  AUTO_SCRIPT_DURATION_SECONDS,
  availableModes,
  coerceStateForEngine,
  coerceStateForMode,
  effectiveDuration,
  effectiveResolution,
  effectiveScriptDuration,
  inputLimitsFor,
  isModeAvailable,
  needsScript,
} from "@/components/video/seedance-v4/lib/mode-input-rules";
import {
  DEFAULT_V4_STATE,
  type SeedanceV4Mode,
  type SeedanceV4WizardState,
} from "@/components/video/seedance-v4/types";
import { SEEDANCE_25_MODES } from "@/lib/seedance/v25/types";

function s(patch: Partial<SeedanceV4WizardState> = {}): SeedanceV4WizardState {
  return { ...DEFAULT_V4_STATE, ...patch };
}

describe("isModeAvailable / availableModes", () => {
  it("2.5 offers all nine modes", () => {
    expect(availableModes("2.5")).toHaveLength(9);
    for (const mode of SEEDANCE_25_MODES) {
      expect(isModeAvailable("2.5", mode)).toBe(true);
    }
  });

  it("2.0 hides edit, extend and voice_clone", () => {
    expect(isModeAvailable("2.0", "edit")).toBe(false);
    expect(isModeAvailable("2.0", "extend")).toBe(false);
    expect(isModeAvailable("2.0", "voice_clone")).toBe(false);
    expect(availableModes("2.0")).toHaveLength(6);
  });

  it("2.0 keeps the six legacy modes", () => {
    for (const mode of ["ugc", "text_to_video", "multi_reference", "multi_frame", "lipsyncing", "first_n_last_frames"] as const) {
      expect(isModeAvailable("2.0", mode)).toBe(true);
    }
  });
});

describe("inputLimitsFor", () => {
  it("ugc accepts products + influencers only, combined 30 on 2.5", () => {
    const l = inputLimitsFor("2.5", "ugc");
    expect(l.ugcCombined).toBe(30);
    expect(l.products).toBe(30);
    expect(l.influencers).toBe(30);
    expect(l.images).toBe(0);
    expect(l.videos).toBe(0);
    expect(l.audios).toBe(0);
  });

  it("ugc on 2.0 caps combined refs at 9", () => {
    expect(inputLimitsFor("2.0", "ugc").ugcCombined).toBe(9);
  });

  it("text_to_video accepts no media at all", () => {
    const l = inputLimitsFor("2.5", "text_to_video");
    expect(l).toMatchObject({
      images: 0,
      videos: 0,
      audios: 0,
      products: 0,
      influencers: 0,
      ugcCombined: 0,
      lipsyncingAudio: 0,
      firstLastFrame: 0,
    });
  });

  it("multi_reference: images ≤ 30, videos ≤ 10, audios ≤ 10", () => {
    expect(inputLimitsFor("2.5", "multi_reference")).toMatchObject({
      images: 30,
      videos: 10,
      audios: 10,
    });
  });

  it("edit / extend / multi_frame accept images, videos and audios", () => {
    for (const mode of ["edit", "extend", "multi_frame"] as const) {
      const l = inputLimitsFor("2.5", mode);
      expect(l.images).toBe(30);
      expect(l.videos).toBe(10);
      expect(l.audios).toBe(10);
      expect(l.ugcCombined).toBe(0);
    }
  });

  it("lipsyncing / voice_clone accept images + a single lipsyncing audio, no videos", () => {
    for (const mode of ["lipsyncing", "voice_clone"] as const) {
      const l = inputLimitsFor("2.5", mode);
      expect(l.images).toBe(30);
      expect(l.lipsyncingAudio).toBe(1);
      expect(l.videos).toBe(0);
      expect(l.audios).toBe(0);
    }
  });

  it("first_n_last_frames takes single frames, not an images array", () => {
    const l = inputLimitsFor("2.5", "first_n_last_frames");
    expect(l.firstLastFrame).toBe(1);
    expect(l.images).toBe(0);
    expect(l.videos).toBe(0);
  });
});

describe("effectiveResolution", () => {
  it("2.5 mirrors the quality tier", () => {
    expect(effectiveResolution(s({ qualityTier: "draft-480p", resolution: "1080p" }))).toBe("480p");
    expect(effectiveResolution(s({ qualityTier: "final-1080p", resolution: "480p" }))).toBe("1080p");
  });

  it("2.0 uses the user's own resolution", () => {
    expect(
      effectiveResolution(s({ engine: "2.0", qualityTier: "draft-480p", resolution: "1080p" }))
    ).toBe("1080p");
  });
});

describe("effectiveDuration", () => {
  it("fixed duration passes through", () => {
    expect(effectiveDuration(s({ duration: 22 }))).toBe(22);
  });

  it("Auto submits -1", () => {
    expect(effectiveDuration(s({ durationMode: "auto", duration: 12 }))).toBe(-1);
  });

  it("edit is always -1, even with a fixed duration set", () => {
    expect(effectiveDuration(s({ mode: "edit", durationMode: "fixed", duration: 12 }))).toBe(-1);
  });

  it("2.0 ignores Auto (the engine does not support it)", () => {
    expect(effectiveDuration(s({ engine: "2.0", durationMode: "auto", duration: 12 }))).toBe(12);
  });
});

describe("effectiveScriptDuration", () => {
  it("never returns less than 4 (the /api/scripts floor)", () => {
    expect(effectiveScriptDuration(s({ duration: 1 }))).toBe(4);
    expect(effectiveScriptDuration(s({ duration: 0 }))).toBe(4);
    expect(effectiveScriptDuration(s({ duration: Number.NaN }))).toBe(AUTO_SCRIPT_DURATION_SECONDS);
  });

  it("Auto and edit are sized for a 10 s read", () => {
    expect(effectiveScriptDuration(s({ durationMode: "auto" }))).toBe(AUTO_SCRIPT_DURATION_SECONDS);
    expect(effectiveScriptDuration(s({ mode: "edit" }))).toBe(AUTO_SCRIPT_DURATION_SECONDS);
  });

  it("passes a real duration through, capped at 30", () => {
    expect(effectiveScriptDuration(s({ duration: 26 }))).toBe(26);
    expect(effectiveScriptDuration(s({ duration: 45 }))).toBe(30);
  });
});

describe("needsScript", () => {
  it("is true for the script-led modes", () => {
    for (const mode of ["ugc", "multi_reference", "multi_frame", "first_n_last_frames"] as const) {
      expect(needsScript(mode)).toBe(true);
    }
  });

  it("is false where a script is optional", () => {
    for (const mode of ["text_to_video", "lipsyncing", "voice_clone", "edit", "extend"] as const) {
      expect(needsScript(mode as SeedanceV4Mode)).toBe(false);
    }
  });
});

describe("coerceStateForEngine", () => {
  it("switching to 2.0 falls back to ugc for a 2.5-only mode", () => {
    const patch = coerceStateForEngine(s({ mode: "extend" }), "2.0");
    expect(patch.engine).toBe("2.0");
    expect(patch.mode).toBe("ugc");
  });

  it("switching to 2.0 replaces an unsupported aspect ratio", () => {
    const patch = coerceStateForEngine(s({ aspectRatio: "adaptive" }), "2.0");
    expect(patch.aspectRatio).toBe("9:16");
  });

  it("switching to 2.0 clamps duration to 15 and disables Auto", () => {
    const patch = coerceStateForEngine(s({ duration: 30, durationMode: "auto" }), "2.0");
    expect(patch.duration).toBe(15);
    expect(patch.durationMode).toBe("fixed");
  });

  it("switching to 2.0 leaves a legal setup alone", () => {
    const patch = coerceStateForEngine(s({ mode: "ugc", duration: 10, aspectRatio: "16:9" }), "2.0");
    expect(patch).toEqual({ engine: "2.0" });
  });

  it("switching to 2.5 keeps mode / aspect / duration and re-mirrors resolution", () => {
    const patch = coerceStateForEngine(
      s({ engine: "2.0", mode: "multi_frame", aspectRatio: "4:3", duration: 12, resolution: "1080p" }),
      "2.5"
    );
    expect(patch.engine).toBe("2.5");
    expect(patch.mode).toBeUndefined();
    expect(patch.aspectRatio).toBeUndefined();
    expect(patch.duration).toBeUndefined();
    // qualityTier is draft-720p by default → resolution must follow it.
    expect(patch.resolution).toBe("720p");
  });
});

describe("coerceStateForMode", () => {
  it("edit forces Auto duration and adaptive aspect", () => {
    const patch = coerceStateForMode(s({ mode: "ugc", durationMode: "fixed" }), "edit");
    expect(patch.mode).toBe("edit");
    expect(patch.durationMode).toBe("auto");
    expect(patch.aspectRatio).toBe("adaptive");
  });

  it("extend and first_n_last_frames lock the aspect to adaptive but keep the duration control", () => {
    for (const mode of ["extend", "first_n_last_frames"] as const) {
      const patch = coerceStateForMode(s(), mode);
      expect(patch.aspectRatio).toBe("adaptive");
      expect(patch.durationMode).toBeUndefined();
    }
  });

  it("leaving an adaptive-only mode resets the aspect to 9:16", () => {
    const patch = coerceStateForMode(s({ mode: "extend", aspectRatio: "adaptive" }), "ugc");
    expect(patch.aspectRatio).toBe("9:16");
  });

  it("leaving edit releases the forced Auto duration", () => {
    const patch = coerceStateForMode(s({ mode: "edit", durationMode: "auto" }), "ugc");
    expect(patch.durationMode).toBe("fixed");
  });

  it("does not force adaptive on engine 2.0 (which has no adaptive aspect)", () => {
    const patch = coerceStateForMode(
      s({ engine: "2.0", aspectRatio: "9:16" }),
      "first_n_last_frames"
    );
    expect(patch.aspectRatio).toBeUndefined();
  });

  it("switching between ordinary modes changes nothing but the mode", () => {
    expect(coerceStateForMode(s({ mode: "ugc" }), "multi_reference")).toEqual({
      mode: "multi_reference",
    });
  });
});
