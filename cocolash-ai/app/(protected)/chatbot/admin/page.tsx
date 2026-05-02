import { createAdminClient } from "@/lib/supabase/server";

export default async function ChatbotAdminOverview() {
  const supabase = await createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceIso = since.toISOString();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [{ count: sessions7d }, { count: sessionsToday }, { count: leadsToday }, { data: cost }] = await Promise.all([
    supabase.from("chat_sessions").select("*", { count: "exact", head: true }).gte("created_at", sinceIso),
    supabase.from("chat_sessions").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
    supabase.from("lead_captures").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
    supabase.from("chat_cost_events").select("total_cost_usd").gte("created_at", todayIso),
  ]);

  const todayCost = (cost ?? []).reduce((sum, r) => sum + Number((r as { total_cost_usd: number }).total_cost_usd), 0);

  const { data: settings } = await supabase
    .from("chat_settings")
    .select("bot_enabled, daily_cap_usd, system_prompt_version, voice_fragments")
    .single();

  const fragments = (settings?.voice_fragments ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-coco-brown">Coco — admin overview</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions today" value={String(sessionsToday ?? 0)} />
        <Stat label="Sessions (7d)" value={String(sessions7d ?? 0)} />
        <Stat label="Leads today" value={String(leadsToday ?? 0)} />
        <Stat label="Spend today" value={`$${todayCost.toFixed(2)}`} />
      </div>
      <div className="rounded-md border border-coco-pink-soft bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-coco-brown">Bot status</h2>
        <p className="text-sm text-coco-brown-medium">
          {settings?.bot_enabled ? "✅ Live" : "⛔ Off"} · daily cap{" "}
          <strong>${Number(settings?.daily_cap_usd ?? 0).toFixed(2)}</strong> · prompt version{" "}
          <strong>{settings?.system_prompt_version ?? "—"}</strong>
        </p>
        <p className="mt-2 text-sm text-coco-brown-medium">
          Greeting: <em>“{fragments.greeting ?? ""}”</em>
        </p>
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
