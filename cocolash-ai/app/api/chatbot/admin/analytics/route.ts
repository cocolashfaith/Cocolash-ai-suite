import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";

export async function GET(_req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const [
      { count: totalSessions },
      { data: messageRows },
      { data: leadRows },
      { data: costRows },
    ] = await Promise.all([
      supabase.from("chat_sessions").select("*", { count: "exact", head: true }).gte("created_at", sinceIso),
      supabase.from("chat_messages").select("session_id, intent, role, created_at").gte("created_at", sinceIso),
      supabase.from("lead_captures").select("id, created_at").gte("created_at", sinceIso),
      supabase.from("chat_cost_events").select("pipeline, total_cost_usd, created_at").gte("created_at", sinceIso),
    ]);

    const messagesBySession: Record<string, number> = {};
    const intentCounts: Record<string, number> = {};
    let userMessages = 0;
    for (const m of (messageRows ?? []) as Array<{ session_id: string; intent: string | null; role: string }>) {
      if (m.role === "user") {
        messagesBySession[m.session_id] = (messagesBySession[m.session_id] ?? 0) + 1;
        userMessages += 1;
      }
      if (m.intent) intentCounts[m.intent] = (intentCounts[m.intent] ?? 0) + 1;
    }

    const sessionLengths = Object.values(messagesBySession);
    const avgConversationLength = sessionLengths.length === 0 ? 0 : sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length;

    const costByPipeline: Record<string, number> = {};
    for (const c of (costRows ?? []) as Array<{ pipeline: string; total_cost_usd: number | string }>) {
      const v = Number(c.total_cost_usd);
      costByPipeline[c.pipeline] = (costByPipeline[c.pipeline] ?? 0) + v;
    }

    return Response.json({
      window: { sinceIso, days: 30 },
      sessions: totalSessions ?? 0,
      userMessages,
      avgConversationLength: Number(avgConversationLength.toFixed(2)),
      intentCounts,
      leads: leadRows?.length ?? 0,
      costByPipeline,
      totalCostUsd: Object.values(costByPipeline).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    return Response.json({ error: "fetch_failed" }, { status: 500 });
  }
}
