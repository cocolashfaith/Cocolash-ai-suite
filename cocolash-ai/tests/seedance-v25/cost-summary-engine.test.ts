import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMonthlyCostSummary } from "@/lib/costs/tracker";
import { createAdminClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server");

/**
 * Package G — the cost dashboard splits Seedance by engine (D1/D4).
 *
 * Three properties matter:
 *   1. `getMonthlyCostSummary` selects `engine` + `credits_cost` and splits the
 *      seedance rows into 2.0 / 2.5 buckets, summing the REAL credit spend for
 *      2.5. A seedance row with a null/absent engine is a pre-2.5 row → 2.0.
 *   2. Before Harry runs the 20260908 migration those columns do not exist and
 *      Postgres answers 42703. The summary must fall back to the legacy select
 *      instead of returning zeroes — the dashboard has to keep working.
 *   3. `seedance` / `seedanceCount` keep the COMBINED totals so every existing
 *      consumer (the settings card, `/api/costs`) is unaffected.
 */

type QueryResult = {
  data: unknown[] | null;
  error: unknown;
  count?: number | null;
};

const MISSING_COLUMN_ERROR = {
  code: "42703",
  message: 'column generated_videos.engine does not exist',
};

const ROWS = [
  { processing_cost: 2.5, pipeline: "heygen", engine: null, credits_cost: null },
  // pipeline null → legacy HeyGen row
  { processing_cost: 1.25, pipeline: null, engine: null, credits_cost: null },
  { processing_cost: 3, pipeline: "seedance", engine: "2.0", credits_cost: null },
  // seedance row written before the migration → engine absent → counts as 2.0
  { processing_cost: 0.5, pipeline: "seedance" },
  { processing_cost: 1.6158, pipeline: "seedance", engine: "2.5", credits_cost: 1615.8 },
  { processing_cost: 0.4888, pipeline: "seedance", engine: "2.5", credits_cost: 488.8 },
];

/** Legacy select drops the 2.5 columns, exactly like a pre-migration DB would. */
const LEGACY_ROWS = ROWS.map((r) => ({
  processing_cost: r.processing_cost,
  pipeline: r.pipeline ?? null,
}));

/**
 * `videoResults` is consumed one per `generated_videos` query, so a test can
 * make the first (new-column) select fail and the retry succeed.
 */
function mockSupabase(videoResults: QueryResult[]) {
  const selects: Record<string, string[]> = {
    generated_videos: [],
    generated_images: [],
    generated_captions: [],
  };
  let videoCall = 0;

  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {};
    Object.assign(query, {
      select: vi.fn((columns: string) => {
        (selects[table] ??= []).push(columns);
        return query;
      }),
      gte: vi.fn(() => query),
      lt: vi.fn(() => query),
      then: (resolve: (r: QueryResult) => unknown) => {
        let result: QueryResult;
        if (table === "generated_videos") {
          result = videoResults[Math.min(videoCall, videoResults.length - 1)];
          videoCall += 1;
        } else {
          result = { data: null, error: null, count: 0 };
        }
        return Promise.resolve(result).then(resolve);
      },
    });
    return query;
  });

  vi.mocked(createAdminClient).mockResolvedValue({ from } as never);
  return { selects, videoQueryCount: () => videoCall };
}

describe("getMonthlyCostSummary — engine split", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for engine and credits_cost", async () => {
    const { selects } = mockSupabase([{ data: ROWS, error: null }]);
    await getMonthlyCostSummary(2026, 9);

    expect(selects.generated_videos[0]).toContain("processing_cost");
    expect(selects.generated_videos[0]).toContain("pipeline");
    expect(selects.generated_videos[0]).toContain("engine");
    expect(selects.generated_videos[0]).toContain("credits_cost");
  });

  it("splits seedance spend into 2.0 and 2.5 buckets", async () => {
    mockSupabase([{ data: ROWS, error: null }]);
    const summary = await getMonthlyCostSummary(2026, 9);

    expect(summary.pipelineBreakdown.seedance20).toBe(3.5);
    expect(summary.pipelineBreakdown.seedance20Count).toBe(2);
    expect(summary.pipelineBreakdown.seedance25).toBe(2.1);
    expect(summary.pipelineBreakdown.seedance25Count).toBe(2);
  });

  it("sums the REAL Enhancor credits for 2.5 rows only", async () => {
    mockSupabase([{ data: ROWS, error: null }]);
    const summary = await getMonthlyCostSummary(2026, 9);

    expect(summary.pipelineBreakdown.seedance25Credits).toBe(2104.6);
  });

  it("keeps the combined seedance totals (backward compatible)", async () => {
    mockSupabase([{ data: ROWS, error: null }]);
    const summary = await getMonthlyCostSummary(2026, 9);
    const b = summary.pipelineBreakdown;

    expect(b.seedance).toBe(5.6);
    expect(b.seedanceCount).toBe(4);
    expect(b.seedance).toBe(Number((b.seedance20 + b.seedance25).toFixed(2)));
    expect(b.seedanceCount).toBe(b.seedance20Count + b.seedance25Count);
  });

  it("leaves the HeyGen bucket and the top-level totals untouched", async () => {
    mockSupabase([{ data: ROWS, error: null }]);
    const summary = await getMonthlyCostSummary(2026, 9);

    expect(summary.pipelineBreakdown.heygen).toBe(3.75);
    expect(summary.pipelineBreakdown.heygenCount).toBe(2);
    expect(summary.videoCount).toBe(6);
    expect(summary.breakdown.videos).toBe(9.35);
    expect(summary.totalCost).toBe(9.35);
    expect(summary.avgCostPerVideo).toBe(1.56);
    expect(summary.month).toBe("September 2026");
  });
});

describe("getMonthlyCostSummary — failed renders are not billed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Seedance 2.5 writes the ESTIMATE into `processing_cost` at insert, before
   * the job is queued. When the provider then fails the render nobody is
   * charged (Enhancor returns no `cost`, so `credits_cost` stays null) — but
   * the estimate is still on the row. It must not reach the dashboard.
   * Real case 2026-09-09: two 720p jobs failed upstream carrying $5.1167 each.
   */
  const WITH_FAILURES = [
    ...ROWS.map((r) => ({ ...r, heygen_status: "completed" })),
    {
      processing_cost: 5.1167,
      pipeline: "seedance",
      engine: "2.5",
      credits_cost: null,
      heygen_status: "failed",
    },
    {
      processing_cost: 5.1167,
      pipeline: "seedance",
      engine: "2.5",
      credits_cost: null,
      heygen_status: "failed",
    },
  ];

  it("asks for the status column", async () => {
    const { selects } = mockSupabase([{ data: WITH_FAILURES, error: null }]);
    await getMonthlyCostSummary(2026, 9);

    expect(selects.generated_videos[0]).toContain("heygen_status");
  });

  it("excludes the estimate on failed rows from every total", async () => {
    mockSupabase([{ data: WITH_FAILURES, error: null }]);
    const summary = await getMonthlyCostSummary(2026, 9);
    const b = summary.pipelineBreakdown;

    // Identical to the all-succeeded numbers: the $10.23 of failed estimates
    // is excluded, not added.
    expect(b.seedance25).toBe(2.1);
    expect(b.seedance).toBe(5.6);
    expect(summary.breakdown.videos).toBe(9.35);
    expect(summary.totalCost).toBe(9.35);
  });

  it("still counts failed jobs as attempts", async () => {
    mockSupabase([{ data: WITH_FAILURES, error: null }]);
    const summary = await getMonthlyCostSummary(2026, 9);

    expect(summary.videoCount).toBe(8);
    expect(summary.pipelineBreakdown.seedance25Count).toBe(4);
  });

  it("records no credits for a failed 2.5 render", async () => {
    mockSupabase([{ data: WITH_FAILURES, error: null }]);
    const summary = await getMonthlyCostSummary(2026, 9);

    expect(summary.pipelineBreakdown.seedance25Credits).toBe(2104.6);
  });

  it("keeps counting rows that have no status at all", async () => {
    mockSupabase([{ data: ROWS, error: null }]);
    const summary = await getMonthlyCostSummary(2026, 9);

    expect(summary.totalCost).toBe(9.35);
  });
});

describe("getMonthlyCostSummary — pre-migration fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries with the legacy select when engine/credits_cost do not exist", async () => {
    const { selects, videoQueryCount } = mockSupabase([
      { data: null, error: MISSING_COLUMN_ERROR },
      { data: LEGACY_ROWS, error: null },
    ]);

    const summary = await getMonthlyCostSummary(2026, 9);

    expect(videoQueryCount()).toBe(2);
    expect(selects.generated_videos[1]).not.toContain("engine");
    expect(selects.generated_videos[1]).not.toContain("credits_cost");
    expect(summary.pipelineBreakdown.seedance).toBe(5.6);
    expect(summary.pipelineBreakdown.seedanceCount).toBe(4);
    expect(summary.pipelineBreakdown.heygen).toBe(3.75);
    expect(summary.videoCount).toBe(6);
  });

  it("attributes every seedance row to 2.0 when the engine column is missing", async () => {
    mockSupabase([
      { data: null, error: MISSING_COLUMN_ERROR },
      { data: LEGACY_ROWS, error: null },
    ]);

    const summary = await getMonthlyCostSummary(2026, 9);

    expect(summary.pipelineBreakdown.seedance20).toBe(5.6);
    expect(summary.pipelineBreakdown.seedance20Count).toBe(4);
    expect(summary.pipelineBreakdown.seedance25).toBe(0);
    expect(summary.pipelineBreakdown.seedance25Count).toBe(0);
    expect(summary.pipelineBreakdown.seedance25Credits).toBe(0);
  });

  it("does not retry for an unrelated query error", async () => {
    const { videoQueryCount } = mockSupabase([
      { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
    ]);

    const summary = await getMonthlyCostSummary(2026, 9);

    expect(videoQueryCount()).toBe(1);
    expect(summary.videoCount).toBe(0);
    expect(summary.pipelineBreakdown.seedance25Credits).toBe(0);
  });
});
