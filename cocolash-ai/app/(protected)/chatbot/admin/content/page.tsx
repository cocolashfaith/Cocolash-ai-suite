import { createAdminClient } from "@/lib/supabase/server";
import { ContentManager } from "./content-manager";

interface ChunkRow {
  source_id: string;
  source_type: string;
  tier: number;
  title: string;
  updated_at: string;
}

export default async function ChatbotAdminContent() {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("knowledge_chunks")
    .select("source_id, source_type, tier, title, updated_at")
    .order("source_type", { ascending: true })
    .order("title", { ascending: true });

  const rows = (data ?? []) as ChunkRow[];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.source_type] = (counts[r.source_type] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-coco-brown">Knowledge base</h1>
      <p className="text-sm text-coco-brown-medium">
        Coco's retrieval corpus. Upload new FAQ snippets, brand voice notes, or product info; they
        land at tier 2 (<code>admin_upload</code>) — overrideable only by tier-1 sources (the curated
        FAQ KB and voice doc, which are managed by re-running the ingest script).
      </p>
      <p className="text-sm text-coco-brown-medium">
        To re-import the System 3 KB run{" "}
        <code className="rounded bg-coco-beige px-1 py-0.5 font-mono">npx tsx scripts/chat-ingest.ts</code>.
      </p>
      <ContentManager rows={rows} counts={counts} />
    </div>
  );
}
