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

  const live = !!settings?.bot_enabled;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-coco-brown">Overview</h1>
        <p className="mt-1 text-sm text-coco-brown-medium">
          How Coco is doing across your store this week.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions today" value={String(sessionsToday ?? 0)} />
        <Stat label="Sessions (7d)" value={String(sessions7d ?? 0)} />
        <Stat label="Leads today" value={String(leadsToday ?? 0)} />
        <Stat label="Spend today" value={`$${todayCost.toFixed(2)}`} />
      </div>

      <div className="rounded-2xl border border-coco-pink-soft bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-coco-brown">Bot status</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
              live
                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                : "bg-stone-100 text-stone-600 ring-stone-500/20"
            }`}
          >
            <span className={`size-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-stone-400"}`} />
            {live ? "Live" : "Off"}
          </span>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-coco-brown-medium">Daily cap</dt>
            <dd className="mt-0.5 font-semibold text-coco-brown">
              ${Number(settings?.daily_cap_usd ?? 0).toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-coco-brown-medium">Prompt version</dt>
            <dd className="mt-0.5 font-semibold text-coco-brown">
              {settings?.system_prompt_version ?? "—"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 border-t border-coco-pink-soft pt-4 text-sm text-coco-brown-medium">
          Greeting: <em className="text-coco-brown">“{fragments.greeting ?? ""}”</em>
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-coco-pink-soft bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="text-xs font-medium uppercase tracking-wide text-coco-brown-medium">{label}</div>
      <div className="mt-1.5 text-3xl font-bold text-coco-brown">{value}</div>
    </div>
  );
}
