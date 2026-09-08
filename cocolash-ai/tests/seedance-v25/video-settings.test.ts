import { describe, it, expect } from "vitest";
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_SETTINGS_SINGLETON_ID,
  VIDEO_SETTINGS_TABLE,
  VideoSettingsSchema,
  getVideoSettings,
  loadVideoSettings,
  mergeVideoSettings,
} from "@/lib/settings/video-settings";
import { SEEDANCE_25_RATES_DEFAULT } from "@/lib/seedance/pricing";

/** Minimal thenable Supabase mock: from().select().order().limit() → {data,error}. */
function makeSupabase(result: { data: unknown; error: unknown }, calls: string[] = []) {
  const chain = {
    select() {
      calls.push("select");
      return chain;
    },
    order() {
      calls.push("order");
      return chain;
    },
    limit() {
      calls.push("limit");
      return Promise.resolve(result);
    },
  };
  return {
    from(table: string) {
      calls.push(`from:${table}`);
      return chain;
    },
  } as never;
}

describe("video settings — defaults (D1/D3/D5)", () => {
  it("defaults: 2.5, draft-720p, 8 s, 9:16, $0.001/credit, seed rates", () => {
    expect(DEFAULT_VIDEO_SETTINGS.default_engine).toBe("2.5");
    expect(DEFAULT_VIDEO_SETTINGS.default_quality_tier).toBe("draft-720p");
    expect(DEFAULT_VIDEO_SETTINGS.default_duration).toBe(8);
    expect(DEFAULT_VIDEO_SETTINGS.default_aspect_ratio).toBe("9:16");
    expect(DEFAULT_VIDEO_SETTINGS.usd_per_credit).toBe(0.001);
    expect(DEFAULT_VIDEO_SETTINGS.rates).toEqual(SEEDANCE_25_RATES_DEFAULT);
    expect(DEFAULT_VIDEO_SETTINGS.id).toBe(VIDEO_SETTINGS_SINGLETON_ID);
    expect(VIDEO_SETTINGS_TABLE).toBe("video_settings");
  });
});

describe("VideoSettingsSchema (PATCH body)", () => {
  it("accepts partial valid patches", () => {
    expect(VideoSettingsSchema.parse({ default_engine: "2.0" })).toEqual({ default_engine: "2.0" });
    expect(VideoSettingsSchema.parse({ default_duration: -1 })).toEqual({ default_duration: -1 });
    expect(VideoSettingsSchema.parse({ default_duration: 30, usd_per_credit: 0.002 })).toEqual({
      default_duration: 30,
      usd_per_credit: 0.002,
    });
    expect(VideoSettingsSchema.parse({ rates: SEEDANCE_25_RATES_DEFAULT }).rates).toEqual(SEEDANCE_25_RATES_DEFAULT);
  });

  it("rejects unknown keys, empty patches and out-of-range values", () => {
    expect(VideoSettingsSchema.safeParse({}).success).toBe(false);
    expect(VideoSettingsSchema.safeParse({ bogus: 1 }).success).toBe(false);
    expect(VideoSettingsSchema.safeParse({ default_engine: "3.0" }).success).toBe(false);
    expect(VideoSettingsSchema.safeParse({ default_quality_tier: "4k" }).success).toBe(false);
    expect(VideoSettingsSchema.safeParse({ default_duration: 3 }).success).toBe(false);
    expect(VideoSettingsSchema.safeParse({ default_duration: 31 }).success).toBe(false);
    expect(VideoSettingsSchema.safeParse({ default_aspect_ratio: "2:1" }).success).toBe(false);
    expect(VideoSettingsSchema.safeParse({ usd_per_credit: 0 }).success).toBe(false);
    expect(VideoSettingsSchema.safeParse({ usd_per_credit: 2 }).success).toBe(false);
    expect(
      VideoSettingsSchema.safeParse({
        rates: { standard: SEEDANCE_25_RATES_DEFAULT.standard },
      }).success
    ).toBe(false);
    expect(
      VideoSettingsSchema.safeParse({
        rates: {
          ...SEEDANCE_25_RATES_DEFAULT,
          standard: { ...SEEDANCE_25_RATES_DEFAULT.standard, "720p": { standard: 0, uncensored: 1 } },
        },
      }).success
    ).toBe(false);
  });
});

describe("mergeVideoSettings (DB row → settings)", () => {
  it("coerces NUMERIC strings and JSONB, keeps valid values", () => {
    const merged = mergeVideoSettings({
      id: VIDEO_SETTINGS_SINGLETON_ID,
      default_engine: "2.0",
      default_quality_tier: "final-1080p",
      default_duration: "12",
      default_aspect_ratio: "1:1",
      usd_per_credit: "0.0015",
      rates: JSON.parse(JSON.stringify(SEEDANCE_25_RATES_DEFAULT)),
      updated_at: "2026-09-08T00:00:00.000Z",
      updated_by: "access-password",
    });
    expect(merged.default_engine).toBe("2.0");
    expect(merged.default_quality_tier).toBe("final-1080p");
    expect(merged.default_duration).toBe(12);
    expect(merged.default_aspect_ratio).toBe("1:1");
    expect(merged.usd_per_credit).toBe(0.0015);
    expect(merged.rates).toEqual(SEEDANCE_25_RATES_DEFAULT);
    expect(merged.updated_by).toBe("access-password");
  });

  it("falls back per-field on invalid data and never throws", () => {
    const merged = mergeVideoSettings({
      default_engine: "9.9",
      default_quality_tier: "ultra",
      default_duration: 99,
      default_aspect_ratio: "weird",
      usd_per_credit: "abc",
      rates: { broken: true },
    });
    expect(merged.default_engine).toBe("2.5");
    expect(merged.default_quality_tier).toBe("draft-720p");
    expect(merged.default_duration).toBe(8);
    expect(merged.default_aspect_ratio).toBe("9:16");
    expect(merged.usd_per_credit).toBe(0.001);
    expect(merged.rates).toEqual(SEEDANCE_25_RATES_DEFAULT);
    expect(mergeVideoSettings(null)).toEqual(DEFAULT_VIDEO_SETTINGS);
  });
});

describe("loadVideoSettings / getVideoSettings", () => {
  it("returns the DB row when present", async () => {
    const calls: string[] = [];
    const supabase = makeSupabase(
      { data: [{ id: VIDEO_SETTINGS_SINGLETON_ID, default_duration: 10, usd_per_credit: "0.001" }], error: null },
      calls
    );
    const res = await loadVideoSettings(supabase);
    expect(res.fromDatabase).toBe(true);
    expect(res.missingTable).toBe(false);
    expect(res.settings.default_duration).toBe(10);
    expect(calls[0]).toBe("from:video_settings");
  });

  it("falls back to defaults when the table is missing (42P01 / PGRST205) and flags it", async () => {
    for (const error of [
      { code: "42P01", message: 'relation "video_settings" does not exist' },
      { code: "PGRST205", message: "Could not find the table 'public.video_settings' in the schema cache" },
    ]) {
      const res = await loadVideoSettings(makeSupabase({ data: null, error }));
      expect(res.fromDatabase).toBe(false);
      expect(res.missingTable).toBe(true);
      expect(res.settings).toEqual(DEFAULT_VIDEO_SETTINGS);
    }
  });

  it("falls back to defaults on empty table or other errors without throwing", async () => {
    const empty = await loadVideoSettings(makeSupabase({ data: [], error: null }));
    expect(empty.fromDatabase).toBe(false);
    expect(empty.missingTable).toBe(false);
    const other = await loadVideoSettings(makeSupabase({ data: null, error: { code: "XX000", message: "boom" } }));
    expect(other.fromDatabase).toBe(false);
    expect(other.missingTable).toBe(false);
    expect(other.error).toBe("boom");
    const thrown = await loadVideoSettings({
      from() {
        throw new Error("network down");
      },
    } as never);
    expect(thrown.settings).toEqual(DEFAULT_VIDEO_SETTINGS);
    expect(await getVideoSettings(makeSupabase({ data: [], error: null }))).toEqual(DEFAULT_VIDEO_SETTINGS);
  });
});
