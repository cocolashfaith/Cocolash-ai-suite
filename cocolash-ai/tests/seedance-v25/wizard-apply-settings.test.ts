import { describe, it, expect } from "vitest";
import {
  applyVideoSettingsToState,
  isPristineWizardState,
} from "@/components/video/seedance-v4/lib/apply-settings";
import {
  DEFAULT_V4_STATE,
  type SeedanceV4WizardState,
} from "@/components/video/seedance-v4/types";
import {
  DEFAULT_VIDEO_SETTINGS,
  type VideoSettings,
} from "@/lib/settings/video-settings";

function s(patch: Partial<SeedanceV4WizardState> = {}): SeedanceV4WizardState {
  return { ...DEFAULT_V4_STATE, ...patch };
}

function settings(patch: Partial<VideoSettings> = {}): VideoSettings {
  return { ...DEFAULT_VIDEO_SETTINGS, ...patch };
}

describe("applyVideoSettingsToState", () => {
  it("copies engine, tier, aspect and duration onto the state", () => {
    const patch = applyVideoSettingsToState(
      s(),
      settings({
        default_engine: "2.5",
        default_quality_tier: "final-1080p",
        default_duration: 20,
        default_aspect_ratio: "16:9",
      })
    );
    expect(patch.engine).toBe("2.5");
    expect(patch.qualityTier).toBe("final-1080p");
    expect(patch.duration).toBe(20);
    expect(patch.durationMode).toBe("fixed");
    expect(patch.aspectRatio).toBe("16:9");
  });

  it("mirrors resolution onto the quality tier", () => {
    expect(
      applyVideoSettingsToState(s(), settings({ default_quality_tier: "draft-480p" })).resolution
    ).toBe("480p");
    expect(
      applyVideoSettingsToState(s(), settings({ default_quality_tier: "final-1080p" })).resolution
    ).toBe("1080p");
  });

  it("default_duration -1 becomes Auto with an 8 s slider fallback", () => {
    const patch = applyVideoSettingsToState(s(), settings({ default_duration: -1 }));
    expect(patch.durationMode).toBe("auto");
    expect(patch.duration).toBe(8);
  });

  it("clamps an out-of-range default duration into 4–30", () => {
    expect(applyVideoSettingsToState(s(), settings({ default_duration: 99 })).duration).toBe(30);
    expect(applyVideoSettingsToState(s(), settings({ default_duration: 1 })).duration).toBe(4);
  });

  it("always marks settingsApplied so it never runs twice", () => {
    expect(applyVideoSettingsToState(s(), settings()).settingsApplied).toBe(true);
  });

  it("a 2.0 default row cannot produce an illegal state", () => {
    const patch = applyVideoSettingsToState(
      s({ mode: "extend" }),
      settings({ default_engine: "2.0", default_duration: 30, default_aspect_ratio: "adaptive" })
    );
    expect(patch.engine).toBe("2.0");
    expect(patch.mode).toBe("ugc");
    expect(patch.duration).toBe(15);
    expect(patch.aspectRatio).toBe("9:16");
    expect(patch.durationMode).toBe("fixed");
  });

  it("keeps the adaptive lock for an adaptive-only mode", () => {
    const patch = applyVideoSettingsToState(
      s({ mode: "extend" }),
      settings({ default_aspect_ratio: "16:9" })
    );
    expect(patch.aspectRatio).toBe("adaptive");
  });

  it("keeps edit on Auto even when the defaults say a fixed duration", () => {
    const patch = applyVideoSettingsToState(s({ mode: "edit" }), settings({ default_duration: 12 }));
    expect(patch.durationMode).toBe("auto");
  });
});

describe("isPristineWizardState", () => {
  it("is true for the untouched default state", () => {
    expect(isPristineWizardState(DEFAULT_V4_STATE)).toBe(true);
  });

  it("is false once the defaults have been applied", () => {
    expect(isPristineWizardState(s({ settingsApplied: true }))).toBe(false);
  });

  it("is false when the user changed something the defaults own", () => {
    expect(isPristineWizardState(s({ engine: "2.0" }))).toBe(false);
    expect(isPristineWizardState(s({ qualityTier: "final-1080p" }))).toBe(false);
    expect(isPristineWizardState(s({ duration: 12 }))).toBe(false);
    expect(isPristineWizardState(s({ durationMode: "auto" }))).toBe(false);
    expect(isPristineWizardState(s({ aspectRatio: "16:9" }))).toBe(false);
    expect(isPristineWizardState(s({ mode: "extend" }))).toBe(false);
  });

  it("is false when the user already put content into the wizard", () => {
    expect(isPristineWizardState(s({ scriptText: "hello" }))).toBe(false);
    expect(isPristineWizardState(s({ ugcProductImageUrls: ["https://x.test/a.png"] }))).toBe(false);
    expect(isPristineWizardState(s({ inputVideoUrls: ["https://x.test/a.mp4"] }))).toBe(false);
    expect(isPristineWizardState(s({ editInstruction: "brighten it" }))).toBe(false);
    expect(isPristineWizardState(s({ directorPrompt: "a prompt" }))).toBe(false);
  });
});
