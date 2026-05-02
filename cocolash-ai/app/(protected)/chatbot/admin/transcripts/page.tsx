import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";

interface SessionRow {
  id: string;
  shopify_customer_id: string | null;
  status: string;
  created_at: string;
  last_active_at: string;
  intent_summary: string | null;
  message_count?: number;
}

export default async function ChatbotAdminTranscripts({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createAdminClient();

  if (params.session) {
    const [{ data: session }, { data: messages }] = await Promise.all([
      supabase.from("chat_sessions").select("*").eq("id", params.session).maybeSingle(),
      supabase
        .from("chat_messages")
        .select("id, role, content, intent, tryon_image_url, created_at")
        .eq("session_id", params.session)
        .order("created_at", { ascending: true }),
    ]);
    return (
      <div className="space-y-4">
        <Link href="/chatbot/admin/transcripts" className="text-sm text-coco-brown-medium underline">
          ← Back to all transcripts
        </Link>
        <h1 className="text-2xl font-bold text-coco-brown">Transcript</h1>
        <p className="text-xs text-coco-brown-medium">
          Session {params.session} · {session?.shopify_customer_id ? `customer ${session.shopify_customer_id}` : "anonymous"} · started{" "}
          {session?.created_at ? new Date(session.created_at).toLocaleString() : "—"}
        </p>
        <div className="space-y-3 rounded-md border border-coco-pink-soft bg-white p-4">
          {(messages ?? []).map((m) => (
            <div key={m.id} className={`rounded-md p-3 ${m.role === "user" ? "bg-coco-beige" : "bg-white border border-coco-pink-soft"}`}>
              <div className="mb-1 flex items-center gap-2 text-xs uppercase text-coco-brown-medium">
                <span>{m.role}</span>
                {m.intent ? <span className="rounded bg-coco-pink-soft px-1.5 py-0.5">{m.intent}</span> : null}
                <span className="ml-auto">{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-coco-brown">{m.content}</div>
              {m.tryon_image_url ? (
                <img src={m.tryon_image_url} alt="Try-on result" className="mt-2 max-w-xs rounded" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("id, shopify_customer_id, status, created_at, last_active_at, intent_summary")
    .order("last_active_at", { ascending: false })
    .limit(100);

  const rows = (sessions ?? []) as SessionRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-coco-brown">Transcripts</h1>
      <p className="text-sm text-coco-brown-medium">Last 100 sessions, most recent first.</p>
      <div className="overflow-hidden rounded-md border border-coco-pink-soft bg-white">
        <table className="w-full text-sm">
          <thead className="bg-coco-beige text-left text-xs uppercase text-coco-brown-medium">
            <tr>
              <th className="px-3 py-2">Session</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Last active</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-coco-brown-medium">
                  No sessions yet.
                </td>
              </tr>
            ) : null}
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-coco-pink-soft hover:bg-coco-beige">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`?session=${s.id}`} className="underline">
                    {s.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">{s.shopify_customer_id ?? "anonymous"}</td>
                <td className="px-3 py-2 text-xs text-coco-brown-medium">
                  {new Date(s.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs text-coco-brown-medium">
                  {new Date(s.last_active_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded bg-coco-pink-soft px-2 py-0.5 text-xs">{s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
