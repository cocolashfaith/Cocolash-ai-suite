"use client";

import { useState } from "react";

interface Row {
  id: string;
  code: string;
  value: number;
  value_type: "percentage" | "fixed_amount";
  discount_class: "order" | "product" | "shipping";
  status: "active" | "paused" | "expired";
  times_used: number;
  usage_limit_per_code: number | null;
  campaign_window: string | null;
  intent_triggers: string[] | null;
  product_line_scope: string[] | null;
}

const INTENT_OPTIONS = ["product", "tryon", "order", "support", "lead_capture", "other"] as const;

export function DiscountsTable({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-md border border-coco-pink-soft bg-white">
      <table className="w-full text-sm">
        <thead className="bg-coco-beige text-left text-xs uppercase tracking-wide text-coco-brown-medium">
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Class</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Used</th>
            <th className="px-3 py-2">Triggers</th>
            <th className="px-3 py-2">Scope</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-4 text-center text-coco-brown-medium">
                No discount rules yet — run the import script.
              </td>
            </tr>
          ) : null}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-coco-pink-soft">
              <td className="px-3 py-2 font-mono">{r.code}</td>
              <td className="px-3 py-2">
                {r.value_type === "percentage"
                  ? `${Math.abs(r.value).toFixed(0)}%`
                  : `$${Math.abs(r.value).toFixed(2)}`}
              </td>
              <td className="px-3 py-2">{r.discount_class}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2">
                {r.times_used}
                {r.usage_limit_per_code ? ` / ${r.usage_limit_per_code}` : ""}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.intent_triggers && r.intent_triggers.length > 0 ? r.intent_triggers.join(", ") : "—"}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.product_line_scope && r.product_line_scope.length > 0 ? r.product_line_scope.join(", ") : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setEditing(editing === r.id ? null : r.id)}
                >
                  {editing === r.id ? "Cancel" : "Edit"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing ? (
        <EditForm
          row={rows.find((r) => r.id === editing)!}
          onSaved={(next) => {
            setRows((rs) => rs.map((r) => (r.id === next.id ? next : r)));
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: Row["status"] }) {
  const className =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "paused"
        ? "bg-amber-100 text-amber-800"
        : "bg-gray-100 text-gray-700";
  return <span className={`rounded px-2 py-0.5 text-xs ${className}`}>{status}</span>;
}

function EditForm({
  row,
  onSaved,
  onCancel,
}: {
  row: Row;
  onSaved: (next: Row) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Row>(row);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/chatbot/admin/discounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          status: draft.status,
          intent_triggers: draft.intent_triggers,
          product_line_scope: draft.product_line_scope,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      onSaved(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-coco-pink-soft bg-coco-beige p-4 text-sm">
      <h3 className="mb-3 font-semibold text-coco-brown">Edit {draft.code}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <div className="mb-1 text-xs uppercase text-coco-brown-medium">Status</div>
          <select
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Row["status"] }))}
            className="w-full rounded-md border border-coco-pink-soft px-2 py-1"
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="expired">expired</option>
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs uppercase text-coco-brown-medium">Intent triggers (comma-separated)</div>
          <input
            type="text"
            value={(draft.intent_triggers ?? []).join(", ")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                intent_triggers: e.target.value.length === 0 ? null : e.target.value.split(/,\s*/),
              }))
            }
            placeholder={INTENT_OPTIONS.join(", ")}
            className="w-full rounded-md border border-coco-pink-soft px-2 py-1"
          />
        </label>
        <label className="block">
          <div className="mb-1 text-xs uppercase text-coco-brown-medium">Product handles (comma-separated)</div>
          <input
            type="text"
            value={(draft.product_line_scope ?? []).join(", ")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                product_line_scope: e.target.value.length === 0 ? null : e.target.value.split(/,\s*/),
              }))
            }
            placeholder="violet, dahlia, rose"
            className="w-full rounded-md border border-coco-pink-soft px-2 py-1"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-coco-brown-medium underline">
          Cancel
        </button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
