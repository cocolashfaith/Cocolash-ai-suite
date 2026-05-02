import { createAdminClient } from "@/lib/supabase/server";

export default async function ChatbotAdminAnalytics() {
  const supabase = await createAdminClient();

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
    supabase.from("chat_messages").select("session_id, intent, role, tryon_image_url").gte("created_at", sinceIso),
    supabase.from("lead_captures").select("id").gte("created_at", sinceIso),
    supabase.from("chat_cost_events").select("pipeline, total_cost_usd").gte("created_at", sinceIso),
  ]);

  const messagesBySession: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};
  let userMessages = 0;
  let tryonCount = 0;
  for (const m of (messageRows ?? []) as Array<{
    session_id: string;
    intent: string | null;
    role: string;
    tryon_image_url: string | null;
  }>) {
    if (m.role === "user") {
      messagesBySession[m.session_id] = (messagesBySession[m.session_id] ?? 0) + 1;
      userMessages += 1;
    }
    if (m.intent) intentCounts[m.intent] = (intentCounts[m.intent] ?? 0) + 1;
    if (m.tryon_image_url) tryonCount += 1;
  }
  const sessionLengths = Object.values(messagesBySession);
  const avgConversationLength = sessionLengths.length === 0 ? 0 : sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length;

  const costByPipeline: Record<string, number> = {};
  for (const c of (costRows ?? []) as Array<{ pipeline: string; total_cost_usd: number | string }>) {
    costByPipeline[c.pipeline] = (costByPipeline[c.pipeline] ?? 0) + Number(c.total_cost_usd);
  }
  const totalCost = Object.values(costByPipeline).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-coco-brown">Analytics</h1>
      <p className="text-sm text-coco-brown-medium">Last 30 days.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions" value={String(totalSessions ?? 0)} />
        <Stat label="User messages" value={String(userMessages)} />
        <Stat label="Avg msgs / session" value={avgConversationLength.toFixed(1)} />
        <Stat label="Leads" value={String(leadRows?.length ?? 0)} />
        <Stat label="Try-ons" value={String(tryonCount)} />
        <Stat label="Spend (all)" value={`$${totalCost.toFixed(2)}`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Intent breakdown">
          {Object.keys(intentCounts).length === 0 ? (
            <p className="text-sm text-coco-brown-medium">No data yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {Object.entries(intentCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="font-mono">{v}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
        <Panel title="Spend by pipeline">
          {Object.keys(costByPipeline).length === 0 ? (
            <p className="text-sm text-coco-brown-medium">No data yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {Object.entries(costByPipeline)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="font-mono">${v.toFixed(4)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-coco-pink-soft bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-coco-brown-medium">{label}</div>
      <div className="mt-1 text-2xl font-bold text-coco-brown">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-coco-pink-soft bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-coco-brown">{title}</h2>
      {children}
    </div>
  );
}
