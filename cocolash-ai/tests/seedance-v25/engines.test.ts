import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_DURATION_SECONDS,
  DEFAULT_ENGINE,
  DEFAULT_QUALITY_TIER,
  QUALITY_TIERS,
  QUALITY_TIER_IDS,
  SEEDANCE_20_API_BASE_DEFAULT,
  SEEDANCE_25_API_BASE,
  SEEDANCE_ENGINES,
  SEEDANCE_ENGINE_IDS,
  engineLabel,
  engineSupportsAspectRatio,
  engineSupportsMode,
  getEngine,
  isAdaptiveOnlyMode,
  isDraftTier,
  isDurationValidForEngine,
  isQualityTier,
  isSeedanceEngine,
  qualityTierToResolution,
  resolutionToQualityTier,
} from "@/lib/seedance/engines";
import {
  SEEDANCE_25_MODES,
  SEEDANCE_25_MODE_LABELS,
  SEEDANCE_25_ADAPTIVE_ONLY_MODES,
  isSeedance25Mode,
} from "@/lib/seedance/v25/types";
import {
  MODE_ALLOWLIST,
  MODE_ALLOWLIST_V25,
  UNIVERSAL_FIELDS,
  UNIVERSAL_FIELDS_V25,
  getAllowedFieldsForMode,
  getDisallowedFields,
  pickAllowed,
} from "@/lib/seedance/mode-allowlist";
import {
  MIGRATION_REQUIRED_CODE,
  MIGRATION_REQUIRED_MESSAGE,
  MIGRATION_REQUIRED_STATUS,
  SEEDANCE25_MIGRATION_FILE,
  isMissingColumnError,
  isMissingTableError,
  isSchemaMissingError,
  migrationRequiredBody,
  rowHasSeedance25Columns,
} from "@/lib/supabase/schema-errors";
import { BUCKETS, VIDEO_INPUTS_MAX_BYTES } from "@/lib/supabase/storage";

describe("engine registry", () => {
  const ORIGINAL_BASE = process.env.ENHANCOR_API_BASE_URL;
  afterEach(() => {
    if (ORIGINAL_BASE === undefined) delete process.env.ENHANCOR_API_BASE_URL;
    else process.env.ENHANCOR_API_BASE_URL = ORIGINAL_BASE;
  });

  it("registers exactly two engines and defaults to 2.5 (D1)", () => {
    expect(SEEDANCE_ENGINE_IDS).toEqual(["2.0", "2.5"]);
    expect(Object.keys(SEEDANCE_ENGINES).sort()).toEqual(["2.0", "2.5"]);
    expect(DEFAULT_ENGINE).toBe("2.5");
    expect(isSeedanceEngine("2.5")).toBe(true);
    expect(isSeedanceEngine("3.0")).toBe(false);
    expect(isSeedanceEngine(undefined)).toBe(false);
  });

  it("2.5 base URL is hard-coded and ignores ENHANCOR_API_BASE_URL", () => {
    process.env.ENHANCOR_API_BASE_URL = "https://example.test/override";
    expect(SEEDANCE_25_API_BASE).toBe("https://apireq.enhancor.ai/api/seedance2.5/v1");
    expect(getEngine("2.5").getApiBase()).toBe(SEEDANCE_25_API_BASE);
  });

  it("2.0 base URL honours ENHANCOR_API_BASE_URL and falls back to the legacy default", () => {
    delete process.env.ENHANCOR_API_BASE_URL;
    expect(getEngine("2.0").getApiBase()).toBe(SEEDANCE_20_API_BASE_DEFAULT);
    expect(SEEDANCE_20_API_BASE_DEFAULT).toBe(
      "https://apireq.enhancor.ai/api/enhancor-ugc-full-access/v1"
    );
    process.env.ENHANCOR_API_BASE_URL = "https://example.test/override";
    expect(getEngine("2.0").getApiBase()).toBe("https://example.test/override");
  });

  it("2.5 exposes all nine modes; 2.0 exposes six (five + text_to_video)", () => {
    expect(SEEDANCE_25_MODES).toHaveLength(9);
    for (const mode of SEEDANCE_25_MODES) {
      expect(engineSupportsMode("2.5", mode)).toBe(true);
      expect(isSeedance25Mode(mode)).toBe(true);
      expect(SEEDANCE_25_MODE_LABELS[mode]).toBeTruthy();
    }
    expect(getEngine("2.0").capabilities.modes).toHaveLength(6);
    expect(engineSupportsMode("2.0", "edit")).toBe(false);
    expect(engineSupportsMode("2.0", "extend")).toBe(false);
    expect(engineSupportsMode("2.0", "voice_clone")).toBe(false);
    expect(engineSupportsMode("2.0", "ugc")).toBe(true);
    expect(isSeedance25Mode("image-to-video")).toBe(false);
  });

  it("duration ranges: 2.0 = 4–15, 2.5 = 4–30 or -1", () => {
    expect(isDurationValidForEngine("2.0", 15)).toBe(true);
    expect(isDurationValidForEngine("2.0", 16)).toBe(false);
    expect(isDurationValidForEngine("2.0", -1)).toBe(false);
    expect(isDurationValidForEngine("2.5", 30)).toBe(true);
    expect(isDurationValidForEngine("2.5", 31)).toBe(false);
    expect(isDurationValidForEngine("2.5", 3)).toBe(false);
    expect(isDurationValidForEngine("2.5", -1)).toBe(true);
    expect(isDurationValidForEngine("2.5", 7.5)).toBe(false);
    expect(DEFAULT_DURATION_SECONDS).toBe(8);
  });

  it("aspect ratios: 2.5 adds 1:1, 21:9 and adaptive", () => {
    expect(engineSupportsAspectRatio("2.5", "adaptive")).toBe(true);
    expect(engineSupportsAspectRatio("2.5", "21:9")).toBe(true);
    expect(engineSupportsAspectRatio("2.5", "1:1")).toBe(true);
    expect(engineSupportsAspectRatio("2.0", "adaptive")).toBe(false);
    expect(getEngine("2.5").capabilities.aspectRatios).toHaveLength(7);
    expect(DEFAULT_ASPECT_RATIO).toBe("9:16");
    for (const m of SEEDANCE_25_ADAPTIVE_ONLY_MODES) expect(isAdaptiveOnlyMode(m)).toBe(true);
    expect(isAdaptiveOnlyMode("ugc")).toBe(false);
  });

  it("capability flags reflect the 2.0 vs 2.5 parameter differences", () => {
    const c25 = getEngine("2.5").capabilities;
    expect(c25.supportsPassFaces).toBe(true);
    expect(c25.supportsIsUncensored).toBe(true);
    expect(c25.supportsOutputFormat).toBe(true);
    expect(c25.supportsBitrateMode).toBe(true);
    expect(c25.supportsFastMode).toBe(false);
    expect(c25.supportsAutoDuration).toBe(true);
    expect(c25.webhookRequired).toBe(true);
    expect(c25.retryQueue).toBe(false); // never retry /queue on 2.5
    expect(c25.reportsCost).toBe(true);
    expect(c25.maxImages).toBe(30);
    expect(c25.maxVideos).toBe(10);
    expect(c25.maxAudios).toBe(10);
    expect(c25.maxUgcRefs).toBe(30);

    const c20 = getEngine("2.0").capabilities;
    expect(c20.supportsIsUncensored).toBe(false);
    expect(c20.supportsOutputFormat).toBe(false);
    expect(c20.supportsBitrateMode).toBe(false);
    expect(c20.supportsFastMode).toBe(true);
    expect(c20.supportsAutoDuration).toBe(false);
    expect(c20.maxUgcRefs).toBe(9);
  });

  it("labels tolerate pre-migration rows", () => {
    expect(engineLabel("2.5")).toBe("Seedance 2.5");
    expect(engineLabel(null)).toBe("Seedance 2.0");
    expect(engineLabel(undefined)).toBe("Seedance 2.0");
  });
});

describe("quality tiers (D3)", () => {
  it("three tiers, draft-720p default, mapped to resolutions", () => {
    expect(QUALITY_TIER_IDS).toEqual(["draft-480p", "draft-720p", "final-1080p"]);
    expect(DEFAULT_QUALITY_TIER).toBe("draft-720p");
    expect(qualityTierToResolution("draft-480p")).toBe("480p");
    expect(qualityTierToResolution("draft-720p")).toBe("720p");
    expect(qualityTierToResolution("final-1080p")).toBe("1080p");
    expect(resolutionToQualityTier("480p")).toBe("draft-480p");
    expect(resolutionToQualityTier("720p")).toBe("draft-720p");
    expect(resolutionToQualityTier("1080p")).toBe("final-1080p");
    expect(QUALITY_TIERS["final-1080p"].kind).toBe("final");
    expect(isQualityTier("draft-720p")).toBe(true);
    expect(isQualityTier("4k")).toBe(false);
  });

  it("only drafts can be re-rendered as Final", () => {
    expect(isDraftTier("draft-480p")).toBe(true);
    expect(isDraftTier("draft-720p")).toBe(true);
    expect(isDraftTier("final-1080p")).toBe(false);
    expect(isDraftTier(null)).toBe(false);
  });
});

describe("mode allow-list — engine-aware", () => {
  it("2.0 tables and helpers are unchanged (default engine = 2.0)", () => {
    expect(Object.keys(MODE_ALLOWLIST)).toEqual([
      "ugc",
      "multi_reference",
      "multi_frame",
      "lipsyncing",
      "first_n_last_frames",
    ]);
    expect(UNIVERSAL_FIELDS.has("type")).toBe(true);
    expect(UNIVERSAL_FIELDS.has("full_access")).toBe(true);
    expect(UNIVERSAL_FIELDS.has("pass_faces")).toBe(false);
    const picked = pickAllowed(
      {
        type: "image-to-video",
        mode: "ugc",
        prompt: "p",
        products: ["a"],
        influencers: ["b"],
        unrestricted: true,
        quality: "high",
        pass_faces: true,
        webhook_url: "w",
      },
      "ugc"
    );
    // 2.0 still drops unrestricted/quality (legacy behaviour) and never knows pass_faces
    expect(picked).toEqual({
      type: "image-to-video",
      mode: "ugc",
      prompt: "p",
      products: ["a"],
      influencers: ["b"],
      webhook_url: "w",
    });
    expect(getAllowedFieldsForMode("text_to_video").has("prompt")).toBe(true);
    expect(getAllowedFieldsForMode("text_to_video").has("mode")).toBe(true);
  });

  it("2.5 has an entry for all nine modes and no legacy universal fields", () => {
    expect(Object.keys(MODE_ALLOWLIST_V25).sort()).toEqual([...SEEDANCE_25_MODES].sort());
    expect(UNIVERSAL_FIELDS_V25.has("type")).toBe(false);
    expect(UNIVERSAL_FIELDS_V25.has("full_access")).toBe(false);
    expect(UNIVERSAL_FIELDS_V25.has("fast_mode")).toBe(false);
    for (const f of ["mode", "resolution", "aspect_ratio", "webhook_url", "pass_faces", "is_uncensored", "output_format", "bitrate_mode"]) {
      expect(UNIVERSAL_FIELDS_V25.has(f), f).toBe(true);
    }
  });

  it("2.5 pickAllowed keeps the advanced flags and strips 2.0-only fields", () => {
    const picked = pickAllowed(
      {
        type: "image-to-video",
        mode: "ugc",
        prompt: "p",
        duration: "8",
        resolution: "720p",
        aspect_ratio: "9:16",
        webhook_url: "w",
        pass_faces: true,
        is_uncensored: false,
        output_format: "mp4",
        bitrate_mode: "standard",
        full_access: true,
        fast_mode: false,
        quality: "high",
        products: ["a"],
        influencers: ["b"],
        videos: ["v"],
        audios: ["x"],
      },
      "ugc",
      "2.5"
    );
    expect(picked).toEqual({
      mode: "ugc",
      prompt: "p",
      duration: "8",
      resolution: "720p",
      aspect_ratio: "9:16",
      webhook_url: "w",
      pass_faces: true,
      is_uncensored: false,
      output_format: "mp4",
      bitrate_mode: "standard",
      products: ["a"],
      influencers: ["b"],
    });
  });

  it("2.5 per-mode fields follow the API reference", () => {
    expect(getDisallowedFields({ videos: ["v"], audios: ["a"] }, "ugc", "2.5")).toEqual(["videos", "audios"]);
    expect(getDisallowedFields({ prompt: "p", duration: 8 }, "multi_frame", "2.5")).toEqual(["prompt", "duration"]);
    expect(getAllowedFieldsForMode("multi_frame", "2.5").has("multi_frame_prompts")).toBe(true);
    expect(getAllowedFieldsForMode("edit", "2.5").has("videos")).toBe(true);
    expect(getAllowedFieldsForMode("extend", "2.5").has("images")).toBe(true);
    expect(getAllowedFieldsForMode("lipsyncing", "2.5").has("lipsyncing_audio")).toBe(true);
    expect(getAllowedFieldsForMode("voice_clone", "2.5").has("lipsyncing_audio")).toBe(true);
    expect(getAllowedFieldsForMode("voice_clone", "2.5").has("videos")).toBe(false);
    expect(getAllowedFieldsForMode("first_n_last_frames", "2.5").has("last_frame_image")).toBe(true);
    expect(getAllowedFieldsForMode("first_n_last_frames", "2.5").has("images")).toBe(false);
    expect(getAllowedFieldsForMode("text_to_video", "2.5").has("images")).toBe(false);
    expect(getAllowedFieldsForMode("multi_reference", "2.5").has("videos")).toBe(true);
  });

  it("throws on an unknown engine/mode combination", () => {
    expect(() => getAllowedFieldsForMode("edit", "2.0")).toThrow(/Unknown Seedance 2\.0 mode/);
    expect(() => getAllowedFieldsForMode("image-to-video" as never, "2.5")).toThrow(/Unknown Seedance 2\.5 mode/);
  });
});

describe("schema-errors — un-applied migration detection", () => {
  it("recognises Postgres 42703 and PostgREST PGRST204 as missing column", () => {
    expect(isMissingColumnError({ code: "42703", message: "column generated_videos.engine does not exist" })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'engine' column of 'generated_videos' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingColumnError({ message: "column \"credits_cost\" does not exist" })).toBe(true);
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError(new Error("boom"))).toBe(false);
  });

  it("recognises 42P01 / PGRST205 as missing table", () => {
    expect(isMissingTableError({ code: "42P01", message: "relation \"video_settings\" does not exist" })).toBe(true);
    expect(isMissingTableError({ code: "PGRST205", message: "Could not find the table 'public.video_settings' in the schema cache" })).toBe(true);
    expect(isMissingTableError({ code: "42703" })).toBe(false);
    expect(isSchemaMissingError({ code: "42703" })).toBe(true);
    expect(isSchemaMissingError({ code: "PGRST205" })).toBe(true);
  });

  it("builds the 503 body that names the migration file", () => {
    const body = migrationRequiredBody({ code: "42703", message: "column x does not exist" });
    expect(MIGRATION_REQUIRED_STATUS).toBe(503);
    expect(body.code).toBe(MIGRATION_REQUIRED_CODE);
    expect(body.migration).toBe(SEEDANCE25_MIGRATION_FILE);
    expect(body.error).toBe(MIGRATION_REQUIRED_MESSAGE);
    expect(body.error).toContain("supabase/migrations/20260908_seedance25.sql");
    expect(body.detail).toBe("column x does not exist");
    expect(migrationRequiredBody().detail).toBeUndefined();
  });

  it("rowHasSeedance25Columns detects post-migration rows from select(*)", () => {
    expect(rowHasSeedance25Columns({ id: "x", engine: "2.5", credits_cost: null })).toBe(true);
    expect(rowHasSeedance25Columns({ id: "x", pipeline: "seedance" })).toBe(false);
    expect(rowHasSeedance25Columns(null)).toBe(false);
  });
});

describe("storage bucket contract", () => {
  it("adds the video-inputs bucket (public, 50 MB)", () => {
    expect(BUCKETS.VIDEO_INPUTS).toBe("video-inputs");
    expect(VIDEO_INPUTS_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});
