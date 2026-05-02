import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";
import { embed, contentHash, EMBEDDING_MODEL } from "@/lib/chat/embeddings";
import { upsertChunk, deleteChunkBySource } from "@/lib/chat/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST: upload content (multipart) → admin_upload tier-2 chunk(s).
 * DELETE: ?source_id=...
 */
export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);
    const form = await req.formData();
    const file = form.get("file");
    const titleField = form.get("title");
    const sourceIdField = form.get("source_id");

    let title: string;
    let sourceId: string;
    let content: string;

    if (file instanceof File) {
      title = (typeof titleField === "string" ? titleField : "") || file.name;
      sourceId = (typeof sourceIdField === "string" ? sourceIdField : "") || `admin:${slug(file.name)}-${Date.now()}`;
      content = await file.text();
    } else {
      const textField = form.get("text");
      if (typeof textField !== "string" || textField.trim().length === 0) {
        return Response.json({ error: "missing_content" }, { status: 400 });
      }
      content = textField;
      title = (typeof titleField === "string" && titleField) || `Manual entry ${new Date().toISOString()}`;
      sourceId = (typeof sourceIdField === "string" && sourceIdField) || `admin:manual-${Date.now()}`;
    }

    if (content.length > 200_000) {
      return Response.json({ error: "too_large", maxBytes: 200_000 }, { status: 413 });
    }

    const hash = await contentHash(content);
    const embedding = await embed(content);
    const result = await upsertChunk(supabase, {
      source_type: "admin_upload",
      source_id: sourceId,
      tier: 2,
      title,
      content,
      metadata: { uploaded_at: new Date().toISOString() },
      content_hash: hash,
      embedding,
      embedding_model: EMBEDDING_MODEL,
    });
    return Response.json({ ok: true, action: result.action, sourceId });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return Response.json(
      { error: "upload_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);
    const { searchParams } = new URL(req.url);
    const sourceId = searchParams.get("source_id");
    if (!sourceId) return Response.json({ error: "missing_source_id" }, { status: 400 });
    await deleteChunkBySource(supabase, "admin_upload", sourceId);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ChatError) {
      return Response.json({ error: err.code }, { status: err.status });
    }
    return Response.json({ error: "delete_failed", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "content";
}
