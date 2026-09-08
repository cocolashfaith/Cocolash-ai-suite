import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SEEDANCE25_COLUMNS,
  findSeedanceVideoByTaskId,
  insertSeedance25Row,
  safeUpdateVideo,
} from "@/lib/seedance/v25/db";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * There is no SQL execution path from this machine (02-DECISIONS.md) — the
 * 20260908 migration is pasted by hand. Until it lands:
 *   - the 2.5 INSERT must fail with migrationRequired (and NOTHING is queued),
 *   - UPDATEs of legacy rows must strip the 14 new columns and retry so the
 *     Seedance 2.0 pipeline keeps working byte-for-byte.
 */

const VIDEO_ID = "22222222-2222-2222-2222-222222222222";

const MISSING_COLUMN = { code: "PGRST204", message: "Could not find the 'engine' column" };
const MISSING_COLUMN_RAW = { code: "42703", message: 'column "engine" does not exist' };

interface UpdateCall {
  patch: Record<string, unknown>;
}

function makeUpdateMock(errors: Array<unknown>) {
  const calls: UpdateCall[] = [];
  const supabase = {
    from: () => ({
      update(patch: Record<string, unknown>) {
        calls.push({ patch });
        const index = calls.length - 1;
        const chain = {
          eq: () => chain,
          then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: errors[index] ?? null }).then(onF, onR),
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

function makeInsertMock(error: unknown, id: string | null = VIDEO_ID) {
  const calls: Array<Record<string, unknown>> = [];
  const supabase = {
    from: () => ({
      insert(row: Record<string, unknown>) {
        calls.push(row);
        return {
          select: () => ({
            single: async () => ({ data: error || !id ? null : { id }, error }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe("SEEDANCE25_COLUMNS", () => {
  it("lists exactly the 14 columns added by the migration", () => {
    expect([...SEEDANCE25_COLUMNS].sort()).toEqual(
      [
        "bitrate_mode",
        "credits_cost",
        "engine",
        "error_message",
        "input_urls",
        "is_uncensored",
        "output_format",
        "pass_faces",
        "quality_tier",
        "request_payload",
        "requested_duration",
        "rerender_of",
        "resolution",
        "seedance_mode",
      ].sort()
    );
    expect(SEEDANCE25_COLUMNS).toHaveLength(14);
  });
});

describe("safeUpdateVideo", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("writes the patch as-is when the migration is applied", async () => {
    const { supabase, calls } = makeUpdateMock([null]);

    const result = await safeUpdateVideo(supabase, VIDEO_ID, {
      heygen_status: "failed",
      error_message: "boom",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].patch).toEqual({ heygen_status: "failed", error_message: "boom" });
    expect(result.error).toBeNull();
    expect(result.strippedColumns).toBe(false);
  });

  it("retries without the 2.5 columns on PGRST204 and reports strippedColumns", async () => {
    const { supabase, calls } = makeUpdateMock([MISSING_COLUMN, null]);

    const result = await safeUpdateVideo(supabase, VIDEO_ID, {
      heygen_status: "failed",
      completed_at: "2026-09-08T00:00:00.000Z",
      error_message: "boom",
      credits_cost: 12,
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].patch).toEqual({
      heygen_status: "failed",
      completed_at: "2026-09-08T00:00:00.000Z",
    });
    expect(result.error).toBeNull();
    expect(result.strippedColumns).toBe(true);
  });

  it("retries on the raw 42703 code too", async () => {
    const { supabase, calls } = makeUpdateMock([MISSING_COLUMN_RAW, null]);
    const result = await safeUpdateVideo(supabase, VIDEO_ID, {
      heygen_status: "processing",
      engine: "2.5",
    });
    expect(calls).toHaveLength(2);
    expect(result.strippedColumns).toBe(true);
  });

  it("does not retry when the patch has no 2.5 columns", async () => {
    const { supabase, calls } = makeUpdateMock([MISSING_COLUMN]);
    const result = await safeUpdateVideo(supabase, VIDEO_ID, { heygen_status: "failed" });
    expect(calls).toHaveLength(1);
    expect(result.error).toEqual(MISSING_COLUMN);
    expect(result.strippedColumns).toBe(false);
  });

  it("surfaces non-schema errors without retrying", async () => {
    const fatal = { code: "23505", message: "duplicate key" };
    const { supabase, calls } = makeUpdateMock([fatal]);
    const result = await safeUpdateVideo(supabase, VIDEO_ID, {
      heygen_status: "failed",
      error_message: "x",
    });
    expect(calls).toHaveLength(1);
    expect(result.error).toEqual(fatal);
  });
});

describe("insertSeedance25Row", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the new row id on success", async () => {
    const { supabase, calls } = makeInsertMock(null);
    const result = await insertSeedance25Row(supabase, { engine: "2.5", pipeline: "seedance" });
    expect(result).toEqual({ ok: true, id: VIDEO_ID });
    expect(calls[0]).toMatchObject({ engine: "2.5" });
  });

  it("maps 42703 (undefined_column) to migrationRequired", async () => {
    const { supabase } = makeInsertMock(MISSING_COLUMN_RAW);
    const result = await insertSeedance25Row(supabase, { engine: "2.5" });
    expect(result).toMatchObject({ ok: false, migrationRequired: true });
  });

  it("maps PGRST204 to migrationRequired", async () => {
    const { supabase } = makeInsertMock(MISSING_COLUMN);
    const result = await insertSeedance25Row(supabase, { engine: "2.5" });
    expect(result).toMatchObject({ ok: false, migrationRequired: true });
  });

  it("maps a missing table (PGRST205) to migrationRequired", async () => {
    const { supabase } = makeInsertMock({
      code: "PGRST205",
      message: "Could not find the table 'public.generated_videos'",
    });
    const result = await insertSeedance25Row(supabase, { engine: "2.5" });
    expect(result).toMatchObject({ ok: false, migrationRequired: true });
  });

  it("does NOT flag migrationRequired for an unrelated failure", async () => {
    const { supabase } = makeInsertMock({ code: "23502", message: "null value" });
    const result = await insertSeedance25Row(supabase, { engine: "2.5" });
    expect(result).toMatchObject({ ok: false, migrationRequired: false });
  });
});

describe("findSeedanceVideoByTaskId", () => {
  function makeSelectMock(data: unknown, error: unknown = null) {
    const filters: Array<[string, unknown]> = [];
    const supabase = {
      from: () => {
        const chain = {
          select: () => chain,
          eq: (col: string, value: unknown) => {
            filters.push([col, value]);
            return chain;
          },
          maybeSingle: async () => ({ data, error }),
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    return { supabase, filters };
  }

  it("filters on seedance_task_id AND pipeline", async () => {
    const { supabase, filters } = makeSelectMock({ id: VIDEO_ID, pipeline: "seedance" });
    const video = await findSeedanceVideoByTaskId(supabase, "task-1");
    expect(video?.id).toBe(VIDEO_ID);
    expect(filters).toEqual([
      ["seedance_task_id", "task-1"],
      ["pipeline", "seedance"],
    ]);
  });

  it("returns null when nothing matches", async () => {
    const { supabase } = makeSelectMock(null);
    expect(await findSeedanceVideoByTaskId(supabase, "nope")).toBeNull();
  });

  it("returns null (and does not throw) on a query error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = makeSelectMock(null, { code: "500", message: "db down" });
    expect(await findSeedanceVideoByTaskId(supabase, "x")).toBeNull();
  });
});
