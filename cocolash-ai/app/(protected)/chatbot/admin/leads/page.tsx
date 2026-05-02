import { createAdminClient } from "@/lib/supabase/server";

interface LeadRow {
  id: string;
  session_id: string;
  email: string;
  consent: boolean;
  intent_at_capture: string | null;
  discount_offered: string | null;
  notes: string | null;
  created_at: string;
}

export default async function ChatbotAdminLeads() {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("lead_captures")
    .select("id, session_id, email, consent, intent_at_capture, discount_offered, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as LeadRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-coco-brown">Leads</h1>
        <a
          href="/api/chatbot/admin/leads?format=csv"
          className="rounded-md bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream"
        >
          Export CSV
        </a>
      </div>
      <p className="text-sm text-coco-brown-medium">Last 200 leads. Use the export for date-range CSVs.</p>
      <div className="overflow-hidden rounded-md border border-coco-pink-soft bg-white">
        <table className="w-full text-sm">
          <thead className="bg-coco-beige text-left text-xs uppercase text-coco-brown-medium">
            <tr>
              <th className="px-3 py-2">Captured</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Intent</th>
              <th className="px-3 py-2">Discount</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-coco-brown-medium">
                  No leads yet.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-coco-pink-soft">
                <td className="px-3 py-2 text-xs text-coco-brown-medium">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                <td className="px-3 py-2 text-xs">{r.intent_at_capture ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.discount_offered ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
