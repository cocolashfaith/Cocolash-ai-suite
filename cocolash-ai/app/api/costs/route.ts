import { NextRequest, NextResponse } from "next/server";
import { getMonthlyCostSummary } from "@/lib/costs/tracker";

/**
 * GET /api/costs
 *
 * Returns the monthly cost summary for a given month.
 * Defaults to the current month if no query params provided.
 *
 * Query params:
 * - year: e.g. 2026
 * - month: 1-12
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year")
      ? Number(searchParams.get("year"))
      : undefined;
    const month = searchParams.get("month")
      ? Number(searchParams.get("month"))
      : undefined;

    const summary = await getMonthlyCostSummary(year, month);

    return NextResponse.json(summary);
  } catch (error: unknown) {
    console.error("[costs] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch cost summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
