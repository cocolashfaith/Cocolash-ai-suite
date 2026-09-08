import { describe, it, expect, vi, beforeEach } from "vitest";
import * as route from "@/app/api/settings/video/route";
import * as supabaseServer from "@/lib/supabase/server";
import * as adminAuth from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_SETTINGS_SINGLETON_ID,
} from "@/lib/settings/video-settings";
import { SEEDANCE_25_RATES_DEFAULT } from "@/lib/seedance/pricing";

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/chat/admin-auth");

/**
 * Package B — GET/PATCH /api/settings/video (D4/D5).
 *
 * The `video_settings` table does not exist in production until Harry runs
 * supabase/migrations/20260908_seedance25.sql, so every read must fall back
 * to defaults (200) and every write must answer 503 `migration_required`.
 */

interface Recorded {
  table?: string;
  updatePatch?: Record<string, unknown>;
  upsertRow?: Record<string, unknown>;
  upsertOptions?: unknown;
  eq?: [string, unknown];
}

/** from(t).select().order().limit() | .update().eq().select().maybeSingle() | .upsert().select().single() */
function makeSupabase(opts: {
  read?: { data: unknown; error: unknown };
  update?: { data: unknown; error: unknown };
  upsert?: { data: unknown; error: unknown };
  rec?: Recorded;
}) {
  const rec = opts.rec ?? {};
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(opts.read ?? { data: [], error: null }),
    update: (patch: Record<string, unknown>) => {
      rec.updatePatch = patch;
      return chain;
    },
    upsert: (row: Record<string, unknown>, options: unknown) => {
      rec.upsertRow = row;
      rec.upsertOptions = options;
      return {
        select: () => ({
          single: () => Promise.resolve(opts.upsert ?? { data: null, error: null }),
        }),
      };
    },
    eq: (col: string, val: unknown) => {
      rec.eq = [col, val];
      return {
        select: () => ({
          maybeSingle: () => Promise.resolve(opts.update ?? { data: null, error: null }),
        }),
      };
    },
  });
  return {
    from: (table: string) => {
      rec.table = table;
      return chain;
    },
  } as never;
}

function patchRequest(body: unknown) {
  return { json: async () => body } as never;
}

const ADMIN = { authUserId: "access-password", email: "access-password", role: "owner" as const };

const DB_ROW = {
  id: VIDEO_SETTINGS_SINGLETON_ID,
  default_engine: "2.5",
  default_quality_tier: "final-1080p",
  default_duration: 12,
  default_aspect_ratio: "9:16",
  // PostgREST returns NUMERIC as a string
  usd_per_credit: "0.002",
  rates: SEEDANCE_25_RATES_DEFAULT,
  updated_at: "2026-09-08T00:00:00.000Z",
  updated_by: "access-password",
  is_singleton: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/settings/video", () => {
  it("returns the stored row with fromDatabase:true", async () => {
    vi.mocked(supabaseServer.createAdminClient).mockResolvedValue(
      makeSupabase({ read: { data: [DB_ROW], error: null } })
    );

    const res = await route.GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fromDatabase).toBe(true);
    expect(body.missingTable).toBe(false);
    expect(body.settings.default_quality_tier).toBe("final-1080p");
    // NUMERIC string coerced by mergeVideoSettings
    expect(body.settings.usd_per_credit).toBe(0.002);
  });

  it("falls back to defaults with missingTable:true and status 200 on PGRST205", async () => {
    vi.mocked(supabaseServer.createAdminClient).mockResolvedValue(
      makeSupabase({
        read: {
          data: null,
          error: { code: "PGRST205", message: "Could not find the table 'public.video_settings'" },
        },
      })
    );

    const res = await route.GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.missingTable).toBe(true);
    expect(body.fromDatabase).toBe(false);
    expect(body.settings).toEqual(DEFAULT_VIDEO_SETTINGS);
  });

  it("still returns defaults (200) when the admin client itself throws", async () => {
    vi.mocked(supabaseServer.createAdminClient).mockRejectedValue(new Error("no cookies"));

    const res = await route.GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.settings).toEqual(DEFAULT_VIDEO_SETTINGS);
    expect(body.fromDatabase).toBe(false);
  });
});

describe("PATCH /api/settings/video — admin gating", () => {
  it("401 when not authenticated", async () => {
    vi.mocked(supabaseServer.createClient).mockResolvedValue(makeSupabase({}));
    vi.mocked(adminAuth.requireChatAdmin).mockRejectedValue(
      new ChatError("not_authenticated", 401, "consent_required")
    );

    const res = await route.PATCH(patchRequest({ default_engine: "2.0" }));
    expect(res.status).toBe(401);
    expect(supabaseServer.createAdminClient).not.toHaveBeenCalled();
  });

  it("403 for a signed-in non-admin", async () => {
    vi.mocked(supabaseServer.createClient).mockResolvedValue(makeSupabase({}));
    vi.mocked(adminAuth.requireChatAdmin).mockRejectedValue(
      new ChatError("forbidden", 403, "session_disabled")
    );

    const res = await route.PATCH(patchRequest({ default_engine: "2.0" }));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/settings/video — validation", () => {
  beforeEach(() => {
    vi.mocked(supabaseServer.createClient).mockResolvedValue(makeSupabase({}));
    vi.mocked(adminAuth.requireChatAdmin).mockResolvedValue(ADMIN);
  });

  it("400 on an unknown key (schema is strict)", async () => {
    const res = await route.PATCH(patchRequest({ bogus: 1 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_settings");
    expect(supabaseServer.createAdminClient).not.toHaveBeenCalled();
  });

  it("400 when default_duration is out of range", async () => {
    const res = await route.PATCH(patchRequest({ default_duration: 31 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_settings");
    expect(typeof body.issues).toBe("string");
  });

  it("400 on an empty patch", async () => {
    const res = await route.PATCH(patchRequest({}));
    expect(res.status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    const res = await route.PATCH({
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as never);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/settings/video — writes", () => {
  beforeEach(() => {
    vi.mocked(supabaseServer.createClient).mockResolvedValue(makeSupabase({}));
    vi.mocked(adminAuth.requireChatAdmin).mockResolvedValue(ADMIN);
  });

  it("updates the singleton with updated_by and returns merged settings", async () => {
    const rec: Recorded = {};
    vi.mocked(supabaseServer.createAdminClient).mockResolvedValue(
      makeSupabase({ update: { data: DB_ROW, error: null }, rec })
    );

    const res = await route.PATCH(
      patchRequest({ usd_per_credit: 0.002, default_quality_tier: "final-1080p" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(rec.table).toBe("video_settings");
    expect(rec.eq).toEqual(["is_singleton", true]);
    expect(rec.updatePatch?.usd_per_credit).toBe(0.002);
    expect(rec.updatePatch?.default_quality_tier).toBe("final-1080p");
    expect(rec.updatePatch?.updated_by).toBe("access-password");
    expect(typeof rec.updatePatch?.updated_at).toBe("string");
    // NUMERIC arrives as a string → coerced
    expect(body.settings.usd_per_credit).toBe(0.002);
    expect(body.settings.default_duration).toBe(12);
  });

  it("accepts a whole rate table (JSONB) unchanged", async () => {
    const rec: Recorded = {};
    vi.mocked(supabaseServer.createAdminClient).mockResolvedValue(
      makeSupabase({ update: { data: DB_ROW, error: null }, rec })
    );

    const res = await route.PATCH(patchRequest({ rates: SEEDANCE_25_RATES_DEFAULT }));
    expect(res.status).toBe(200);
    expect(rec.updatePatch?.rates).toEqual(SEEDANCE_25_RATES_DEFAULT);
  });

  it("upserts the singleton when no row exists yet", async () => {
    const rec: Recorded = {};
    vi.mocked(supabaseServer.createAdminClient).mockResolvedValue(
      makeSupabase({
        update: { data: null, error: null },
        upsert: { data: { ...DB_ROW, default_engine: "2.0" }, error: null },
        rec,
      })
    );

    const res = await route.PATCH(patchRequest({ default_engine: "2.0" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(rec.upsertRow?.id).toBe(VIDEO_SETTINGS_SINGLETON_ID);
    expect(rec.upsertRow?.is_singleton).toBe(true);
    expect(rec.upsertRow?.default_engine).toBe("2.0");
    expect(rec.upsertRow?.updated_by).toBe("access-password");
    expect(rec.upsertOptions).toEqual({ onConflict: "is_singleton" });
    expect(body.settings.default_engine).toBe("2.0");
  });

  it("503 migration_required when the table is missing", async () => {
    vi.mocked(supabaseServer.createAdminClient).mockResolvedValue(
      makeSupabase({
        update: {
          data: null,
          error: { code: "42P01", message: 'relation "video_settings" does not exist' },
        },
      })
    );

    const res = await route.PATCH(patchRequest({ default_engine: "2.0" }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe("migration_required");
    expect(body.migration).toBe("supabase/migrations/20260908_seedance25.sql");
  });

  it("500 on an unexpected write error", async () => {
    vi.mocked(supabaseServer.createAdminClient).mockResolvedValue(
      makeSupabase({
        update: { data: null, error: { code: "23514", message: "check constraint" } },
      })
    );

    const res = await route.PATCH(patchRequest({ default_engine: "2.0" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("update_failed");
  });
});
