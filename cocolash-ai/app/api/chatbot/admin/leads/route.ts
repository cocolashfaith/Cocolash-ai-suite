import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";

/**
 * GET /api/chatbot/admin/leads?format=csv&from=YYYY-MM-DD&to=YYYY-MM-DD
 * format=csv → CSV download; otherwise JSON.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let q = supabase
      .from("lead_captures")
      .select("id, session_id, email, consent, intent_at_capture, discount_offered, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
    if (to) q = q.lte("created_at", `${to}T23:59:59Z`);
    const { data, error } = await q;
    if (error) throw error;

    const rows = (data ?? []) as Array<{
      id: string;
      session_id: string;
      email: string;
      consent: boolean;
      intent_at_capture: string | null;
      discount_offered: string | null;
      notes: string | null;
      created_at: string;
    }>;

    if (format === "csv") {
      const header = "id,session_id,email,consent,intent_at_capture,discount_offered,notes,created_at";
      const escape = (v: string | boolean | null): string => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const body = rows
        .map((r) =>
          [r.id, r.session_id, r.email, r.consent, r.intent_at_capture, r.discount_offered, r.notes, r.created_at]
            .map(escape)
            .join(",")
        )
        .join("\n");
      return new Response(`${header}\n${body}`, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="cocolash-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }
    return Response.json({ leads: rows });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    return Response.json({ error: "fetch_failed" }, { status: 500 });
  }
}
