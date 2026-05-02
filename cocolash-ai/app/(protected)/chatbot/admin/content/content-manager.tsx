"use client";

import { useRef, useState } from "react";

interface Row {
  source_id: string;
  source_type: string;
  tier: number;
  title: string;
  updated_at: string;
}

export function ContentManager({ rows: initial, counts }: { rows: Row[]; counts: Record<string, number> }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadText() {
    if (!text.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("text", text);
      if (title) form.append("title", title);
      const res = await fetch("/api/chatbot/admin/content", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { sourceId: string };
      setRows((rs) => [
        ...rs,
        {
          source_id: data.sourceId,
          source_type: "admin_upload",
          tier: 2,
          title: title || "Manual entry",
          updated_at: new Date().toISOString(),
        },
      ]);
      setText("");
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/chatbot/admin/content", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { sourceId: string };
      setRows((rs) => [
        ...rs,
        {
          source_id: data.sourceId,
          source_type: "admin_upload",
          tier: 2,
          title: file.name,
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(sourceId: string) {
    if (!confirm(`Delete chunk ${sourceId}?`)) return;
    const res = await fetch(`/api/chatbot/admin/content?source_id=${encodeURIComponent(sourceId)}`, { method: "DELETE" });
    if (res.ok) setRows((rs) => rs.filter((r) => r.source_id !== sourceId));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="rounded-md border border-coco-pink-soft bg-white p-3">
            <div className="text-xs uppercase text-coco-brown-medium">{k}</div>
            <div className="text-xl font-semibold text-coco-brown">{v}</div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-coco-pink-soft bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-coco-brown">Upload content</h2>
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-2 w-full rounded-md border border-coco-pink-soft px-2 py-1 text-sm"
        />
        <textarea
          rows={5}
          placeholder="Paste FAQ snippets, brand voice notes, or product info…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-coco-pink-soft px-2 py-1 text-sm leading-relaxed"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={uploadText}
            disabled={uploading || text.trim().length === 0}
            className="rounded-md bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Save text"}
          </button>
          <span className="text-xs text-coco-brown-medium">or</span>
          <label className="cursor-pointer text-sm text-coco-brown underline">
            Upload file
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
              }}
            />
          </label>
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-coco-pink-soft bg-white">
        <table className="w-full text-sm">
          <thead className="bg-coco-beige text-left text-xs uppercase text-coco-brown-medium">
            <tr>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-coco-brown-medium">
                  No chunks ingested yet.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.source_id} className="border-t border-coco-pink-soft">
                <td className="px-3 py-2 font-mono text-xs">{r.source_type}</td>
                <td className="px-3 py-2">{r.tier}</td>
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2 text-xs text-coco-brown-medium">
                  {new Date(r.updated_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.source_type === "admin_upload" ? (
                    <button type="button" onClick={() => remove(r.source_id)} className="text-xs text-red-600 underline">
                      Delete
                    </button>
                  ) : (
                    <span className="text-xs text-coco-brown-medium">read-only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
