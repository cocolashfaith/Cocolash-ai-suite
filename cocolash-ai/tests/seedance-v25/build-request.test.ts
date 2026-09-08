import { describe, it, expect } from "vitest";
import {
  buildSeedance20Body,
  buildSeedance25GenerateBody,
  isEnhancorParityUgc,
  multiFrameTotalSeconds,
} from "@/components/video/seedance-v4/lib/build-request";
import { DEFAULT_V4_STATE } from "@/components/video/seedance-v4/types";
import type { SeedanceV4WizardState } from "@/components/video/seedance-v4/types";
import {
  Seedance25GenerateBodySchema,
  formatZodIssues,
} from "@/lib/seedance/v25/schema";
import { SEEDANCE_25_MODES } from "@/lib/seedance/v25/types";

/**
 * Package E step 1 — the wizard → Enhancor request builder.
 *
 * The contract that matters: for EVERY mode the body Step 3 POSTs must pass
 * `Seedance25GenerateBodySchema` unchanged (the route re-validates it), and it
 * must carry exactly the media fields that mode accepts — the schema rejects
 * anything else with "<field> is not accepted in <mode> mode".
 */

const IMG = "https://cdn.example.com/image.jpg";
const IMG2 = "https://cdn.example.com/image-2.jpg";
const VID = "https://cdn.example.com/clip.mp4";
const AUD = "https://cdn.example.com/voice.mp3";

/** Wizard state with the inputs each mode needs, so the built body is valid. */
function stateFor(
  mode: SeedanceV4WizardState["mode"],
  overrides: Partial<SeedanceV4WizardState> = {}
): SeedanceV4WizardState {
  const base: SeedanceV4WizardState = {
    ...DEFAULT_V4_STATE,
    mode,
    scriptText: "Say something nice about the lashes.",
    campaignType: "product-showcase",
    tone: "casual",
  };

  switch (mode) {
    case "ugc":
      return {
        ...base,
        ugcProductImageUrls: [IMG],
        ugcInfluencerImageUrls: [IMG2],
        ugcInfluencerImageUrl: IMG2,
        ...overrides,
      };
    case "multi_reference":
      return {
        ...base,
        multiReferenceImages: [{ url: IMG, role: "appearance" }],
        ...overrides,
      };
    case "first_n_last_frames":
      return { ...base, firstFrameUrl: IMG, lastFrameUrl: IMG2, ...overrides };
    case "edit":
    case "extend":
      return { ...base, inputVideoUrls: [VID], ...overrides };
    case "lipsyncing":
    case "voice_clone":
      return {
        ...base,
        inputImageUrls: [IMG],
        lipsyncImageUrl: IMG,
        lipsyncAudioUrl: AUD,
        ...overrides,
      };
    default:
      return { ...base, ...overrides };
  }
}

const SEGMENTS = [
  { prompt: "Shot one: hands opening the box.", duration: 4 },
  { prompt: "Shot two: close-up of the lashes.", duration: 4 },
];

function build(state: SeedanceV4WizardState) {
  return buildSeedance25GenerateBody(state, "A cozy bathroom morning routine.", SEGMENTS);
}

function parse(body: unknown) {
  const result = Seedance25GenerateBodySchema.safeParse(body);
  if (!result.success) {
    throw new Error(`schema rejected the built body: ${formatZodIssues(result.error)}`);
  }
  return result.data;
}

describe("buildSeedance25GenerateBody — every mode produces a schema-valid body", () => {
  for (const mode of SEEDANCE_25_MODES) {
    it(`${mode} passes Seedance25GenerateBodySchema`, () => {
      const parsed = parse(build(stateFor(mode)));
      expect(parsed.engine).toBe("2.5");
      expect(parsed.request.mode).toBe(mode);
    });
  }
});

describe("envelope", () => {
  it("carries the script + campaign metadata and the quality tier", () => {
    const state = stateFor("ugc", {
      qualityTier: "draft-480p",
      scriptId: "0f9a2b74-9f6f-4b1a-9a5f-2f3a1c1a1111",
      productSku: "SORREL",
    });
    const body = parse(build(state));
    expect(body.qualityTier).toBe("draft-480p");
    expect(body.request.resolution).toBe("480p");
    expect(body.scriptText).toBe("Say something nice about the lashes.");
    expect(body.scriptId).toBe("0f9a2b74-9f6f-4b1a-9a5f-2f3a1c1a1111");
    expect(body.campaignType).toBe("product-showcase");
    expect(body.tone).toBe("casual");
    expect(body.productSku).toBe("SORREL");
  });

  it("keeps qualityTier and request.resolution consistent for every tier", () => {
    for (const [tier, resolution] of [
      ["draft-480p", "480p"],
      ["draft-720p", "720p"],
      ["final-1080p", "1080p"],
    ] as const) {
      const body = parse(build(stateFor("ugc", { qualityTier: tier })));
      expect(body.qualityTier).toBe(tier);
      expect(body.request.resolution).toBe(resolution);
    }
  });

  it("omits empty optional envelope fields rather than sending empty strings", () => {
    const body = build(stateFor("text_to_video", { scriptText: "", productSku: "" }));
    expect(body.scriptText).toBeUndefined();
    expect(body.productSku).toBeUndefined();
    expect(body.scriptId).toBeUndefined();
    parse(body);
  });
});

describe("duration", () => {
  it("sends the fixed duration in fixed mode", () => {
    const body = parse(build(stateFor("ugc", { durationMode: "fixed", duration: 12 })));
    expect(body.request.duration).toBe(12);
  });

  it("sends -1 when the user picked Auto", () => {
    const body = parse(build(stateFor("ugc", { durationMode: "auto", duration: 12 })));
    expect(body.request.duration).toBe(-1);
  });

  it("sends -1 for edit regardless of the wizard's duration setting", () => {
    const body = parse(
      build(stateFor("edit", { durationMode: "fixed", duration: 12 }))
    );
    expect(body.request.duration).toBe(-1);
  });

  it("multi_frame duration is the sum of the segments", () => {
    const body = parse(build(stateFor("multi_frame", { duration: 30 })));
    expect(body.request.duration).toBe(8);
    expect(body.request.multi_frame_prompts).toHaveLength(2);
  });
});

describe("per-mode media fields", () => {
  it("ugc sends products + influencers only", () => {
    const body = parse(build(stateFor("ugc")));
    expect(body.request.products).toEqual([IMG]);
    expect(body.request.influencers).toEqual([IMG2]);
    expect(body.request.images).toBeUndefined();
    expect(body.request.videos).toBeUndefined();
  });

  it("ugc falls back to the single legacy influencer key when the array is empty", () => {
    const body = parse(
      build(
        stateFor("ugc", { ugcInfluencerImageUrls: [], ugcInfluencerImageUrl: IMG2 })
      )
    );
    expect(body.request.influencers).toEqual([IMG2]);
  });

  it("ugc works with products only (no influencer selected)", () => {
    const body = parse(
      build(
        stateFor("ugc", {
          ugcInfluencerImageUrls: [],
          ugcInfluencerImageUrl: undefined,
        })
      )
    );
    expect(body.request.products).toEqual([IMG]);
    expect(body.request.influencers).toBeUndefined();
  });

  it("text_to_video sends no media at all", () => {
    const body = parse(build(stateFor("text_to_video")));
    expect(body.request.prompt).toBeTruthy();
    expect(body.request.images).toBeUndefined();
    expect(body.request.products).toBeUndefined();
    expect(body.request.influencers).toBeUndefined();
    expect(body.request.videos).toBeUndefined();
    expect(body.request.audios).toBeUndefined();
  });

  it("multi_reference prefers the role-tagged picker, falling back to inputImageUrls", () => {
    const withRoles = parse(build(stateFor("multi_reference")));
    expect(withRoles.request.images).toEqual([IMG]);

    const fallback = parse(
      build(
        stateFor("multi_reference", {
          multiReferenceImages: [],
          inputImageUrls: [IMG2],
          inputVideoUrls: [VID],
          inputAudioUrls: [AUD],
        })
      )
    );
    expect(fallback.request.images).toEqual([IMG2]);
    expect(fallback.request.videos).toEqual([VID]);
    expect(fallback.request.audios).toEqual([AUD]);
  });

  it("first_n_last_frames sends the two frame slots and coerces aspect to adaptive", () => {
    const body = parse(build(stateFor("first_n_last_frames")));
    expect(body.request.first_frame_image).toBe(IMG);
    expect(body.request.last_frame_image).toBe(IMG2);
    expect(body.request.aspect_ratio).toBe("adaptive");
  });

  it("multi_frame sends segments and NO top-level prompt", () => {
    const body = parse(build(stateFor("multi_frame")));
    expect(body.request.multi_frame_prompts).toEqual(SEGMENTS);
    expect(body.request.prompt).toBeUndefined();
  });

  it("edit / extend send videos (+ optional images/audios) and default to mov", () => {
    const edit = parse(build(stateFor("edit", { inputImageUrls: [IMG] })));
    expect(edit.request.videos).toEqual([VID]);
    expect(edit.request.images).toEqual([IMG]);
    expect(edit.request.output_format).toBe("mov");

    const extend = parse(build(stateFor("extend", { inputAudioUrls: [AUD] })));
    expect(extend.request.videos).toEqual([VID]);
    expect(extend.request.audios).toEqual([AUD]);
    expect(extend.request.output_format).toBe("mov");
  });

  it("lipsyncing / voice_clone send images + lipsyncing_audio", () => {
    for (const mode of ["lipsyncing", "voice_clone"] as const) {
      const body = parse(build(stateFor(mode)));
      expect(body.request.images).toEqual([IMG]);
      expect(body.request.lipsyncing_audio).toBe(AUD);
      expect(body.request.videos).toBeUndefined();
    }
  });

  it("lipsyncing falls back to the single legacy image key", () => {
    const body = parse(
      build(stateFor("lipsyncing", { inputImageUrls: [], lipsyncImageUrl: IMG2 }))
    );
    expect(body.request.images).toEqual([IMG2]);
  });
});

describe("output settings", () => {
  it("passes pass_faces / is_uncensored / bitrate_mode / output_format through", () => {
    const body = parse(
      build(
        stateFor("ugc", {
          passFaces: false,
          isUncensored: true,
          bitrateMode: "high",
          outputFormat: "mov",
        })
      )
    );
    expect(body.request.pass_faces).toBe(false);
    expect(body.request.is_uncensored).toBe(true);
    expect(body.request.bitrate_mode).toBe("high");
    expect(body.request.output_format).toBe("mov");
  });

  it("defaults output_format to mp4 for non edit/extend modes", () => {
    const body = parse(build(stateFor("ugc", { outputFormat: undefined })));
    expect(body.request.output_format).toBe("mp4");
  });

  it("sends the wizard aspect ratio for non-adaptive modes", () => {
    const body = parse(build(stateFor("ugc", { aspectRatio: "16:9" })));
    expect(body.request.aspect_ratio).toBe("16:9");
  });
});

describe("multiFrameTotalSeconds", () => {
  it("sums the segment durations", () => {
    expect(multiFrameTotalSeconds(SEGMENTS)).toBe(8);
    expect(multiFrameTotalSeconds([])).toBe(0);
  });
});

describe("buildSeedance20Body — the legacy 2.0 payload is unchanged", () => {
  const legacyState: SeedanceV4WizardState = {
    ...DEFAULT_V4_STATE,
    engine: "2.0",
    mode: "ugc",
    duration: 8,
    resolution: "720p",
    aspectRatio: "9:16",
    scriptText: "script",
    campaignType: "product-showcase",
    tone: "casual",
    ugcComposedImageUrl: IMG,
    ugcWasComposed: true,
    productSku: "SORREL",
  };

  it("ugc (non-parity) matches the historic body shape exactly", () => {
    expect(buildSeedance20Body(legacyState, "PROMPT", [])).toEqual({
      aspectRatio: "9:16",
      resolution: "720p",
      duration: 8,
      fastMode: false,
      campaignType: "product-showcase",
      tone: "casual",
      seedanceMode: "ugc",
      productSku: "SORREL",
      fullAccess: true,
      scriptText: "script",
      overridePrompt: "PROMPT",
      type: "image-to-video",
      personImageUrl: IMG,
      productImageUrl: IMG,
    });
  });

  it("Enhancor-parity UGC keeps the influencer-first arrays payload", () => {
    const parity: SeedanceV4WizardState = {
      ...legacyState,
      ugcInfluencerImageUrl: IMG2,
      ugcProductImageUrls: [IMG],
    };
    expect(isEnhancorParityUgc(parity)).toBe(true);
    expect(buildSeedance20Body(parity, "PROMPT", [])).toEqual({
      type: "image-to-video",
      seedanceMode: "ugc",
      prompt: "PROMPT",
      duration: 8,
      resolution: "720p",
      aspectRatio: "9:16",
      fullAccess: true,
      unrestricted: false,
      quality: "standard",
      influencers: [IMG2],
      products: [IMG],
      scriptText: "script",
      campaignType: "product-showcase",
      tone: "casual",
      fastMode: false,
      personImageUrl: IMG2,
      productImageUrl: IMG,
      overridePrompt: "PROMPT",
    });
  });

  it("multi_frame joins the segments into overridePrompt and sends multiFramePrompts", () => {
    const body = buildSeedance20Body(
      { ...legacyState, mode: "multi_frame" },
      "",
      SEGMENTS
    ) as Record<string, unknown>;
    expect(body.multiFramePrompts).toEqual(SEGMENTS);
    expect(body.overridePrompt).toBe(
      "Shot 1 (4s): Shot one: hands opening the box.\n\nShot 2 (4s): Shot two: close-up of the lashes."
    );
  });

  it("text_to_video keeps the legacy type + ugc mode mapping", () => {
    const body = buildSeedance20Body(
      { ...legacyState, mode: "text_to_video" },
      "PROMPT",
      []
    ) as Record<string, unknown>;
    expect(body.type).toBe("text-to-video");
    expect(body.seedanceMode).toBe("ugc");
  });
});
