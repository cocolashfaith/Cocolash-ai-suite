import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/videos/route";
import { createAdminClient } from "@/lib/supabase/server";
import { MIGRATION_REQUIRED_CODE } from "@/lib/supabase/schema-errors";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/supabase/server");

/**
 * Package E step 9 — GET /api/videos?engine=2.0|2.5 (D14 gallery filter).
 *
 * Two properties matter:
 *   1. `engine` narrows the query with `.eq("engine", …)`, and ONLY for the two
 *      legal values (a junk query string must not become a Postgres filter).
 *   2. Before Harry runs the migration the `engine` column does not exist, and
 *      Postgres answers 42703. The gallery must get the actionable 503
 *      "migration_required" body naming the SQL file — not a generic 500.
 */

type QueryResult = { data: unknown[] | null; error: unknown; count: number | null };

function mockSupabase(result: QueryResult) {
  const eqCalls: Array<[string, unknown]> = [];
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return query;
    }),
    then: (resolve: (r: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  });
  const from = vi.fn(() => query);
  vi.mocked(createAdminClient).mockResolvedValue({ from } as never);
  return { eqCalls, from };
}

function request(qs: string) {
  return new NextRequest(`http://localhost:3000/api/videos${qs}`);
}

const OK: QueryResult = { data: [], error: null, count: 0 };

describe("GET /api/videos — engine filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds .eq('engine','2.5') for engine=2.5", async () => {
    const { eqCalls } = mockSupabase(OK);
    const res = await GET(request("?engine=2.5"));
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(["engine", "2.5"]);
  });

  it("adds .eq('engine','2.0') for engine=2.0", async () => {
    const { eqCalls } = mockSupabase(OK);
    await GET(request("?engine=2.0"));
    expect(eqCalls).toContainEqual(["engine", "2.0"]);
  });

  it("combines the pipeline and engine filters", async () => {
    const { eqCalls } = mockSupabase(OK);
    await GET(request("?pipeline=seedance&engine=2.5"));
    expect(eqCalls).toContainEqual(["pipeline", "seedance"]);
    expect(eqCalls).toContainEqual(["engine", "2.5"]);
  });

  it("ignores an unsupported engine value", async () => {
    const { eqCalls } = mockSupabase(OK);
    const res = await GET(request("?engine=3.0"));
    expect(res.status).toBe(200);
    expect(eqCalls.some(([column]) => column === "engine")).toBe(false);
  });

  it("does not filter by engine when the param is absent", async () => {
    const { eqCalls } = mockSupabase(OK);
    await GET(request("?status=completed"));
    expect(eqCalls).toContainEqual(["heygen_status", "completed"]);
    expect(eqCalls.some(([column]) => column === "engine")).toBe(false);
  });
});

describe("GET /api/videos — pre-migration tolerance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 503 migration_required when the engine column does not exist (42703)", async () => {
    mockSupabase({
      data: null,
      count: null,
      error: { code: "42703", message: 'column generated_videos.engine does not exist' },
    });
    const res = await GET(request("?engine=2.5"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe(MIGRATION_REQUIRED_CODE);
    expect(body.migration).toContain("20260908_seedance25.sql");
  });

  it("still returns 500 for an unrelated database error", async () => {
    mockSupabase({
      data: null,
      count: null,
      error: { code: "08006", message: "connection failure" },
    });
    const res = await GET(request(""));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch videos");
  });
});

/**
 * The gallery page's half of the same contract (QA defects 39/41/42).
 *
 * Before this, a 503 from the engine chips was swallowed by a toast: the chip
 * stayed lit, the previous filter's rows stayed on screen, and the user was
 * left believing the filter had been applied to what they were looking at.
 * There is no DOM environment in this suite (vitest runs `environment: "node"`),
 * so the wiring is asserted on the page source — the same approach
 * tests/seedance-v25/step3-settings-and-progress.test.ts uses.
 */
describe("gallery page — a pre-migration engine filter fails visibly", () => {
  const page = readFileSync(
    resolve(__dirname, "../..", "app/(protected)/video/gallery/page.tsx"),
    "utf8"
  );

  it("recognises the 503 by the shared migration_required code", () => {
    expect(page).toContain(
      'import {\n  MIGRATION_REQUIRED_CODE,\n  SEEDANCE25_MIGRATION_FILE,\n} from "@/lib/supabase/schema-errors";'
    );
    expect(page).toContain("if (data?.code === MIGRATION_REQUIRED_CODE) {");
  });

  it("reverts the chip to the last filter that actually loaded", () => {
    expect(page).toContain("setPipelineFilter(appliedPipelineRef.current);");
    expect(page).toContain("appliedPipelineRef.current = pipelineFilter;");
  });

  it("shows an inline amber banner naming the SQL file, not just a toast", () => {
    expect(page).toContain("setMigrationBlocked(true);");
    expect(page).toContain("{migrationBlocked && (");
    expect(page).toContain("border-amber-300 bg-amber-50");
    expect(page).toContain("{SEEDANCE25_MIGRATION_FILE}");
  });

  it("clears the banner when the user picks another chip", () => {
    expect(page).toContain("setMigrationBlocked(false);");
  });

  it("drops the previous filter's rows while a new filter loads", () => {
    expect(page).toContain("if (!append) setVideos([]);");
  });

  it("tolerates a non-JSON error body instead of throwing over it", () => {
    expect(page).toContain("await res.json().catch(() => ({}))");
  });
});
