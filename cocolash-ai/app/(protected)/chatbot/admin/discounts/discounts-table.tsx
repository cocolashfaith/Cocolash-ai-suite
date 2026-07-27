"use client";

import { useState } from "react";
import { Plus, X, Pencil } from "lucide-react";

const PRIMARY_BTN =
  "inline-flex items-center gap-1.5 rounded-lg bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream shadow-sm transition-colors hover:bg-coco-brown-light disabled:opacity-50";
const GHOST_BTN =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-coco-brown-medium transition-colors hover:text-coco-brown";

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

function parseList(raw: string): string[] | null {
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length === 0 ? null : items;
}

export function DiscountsTable({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setCreating((c) => !c);
            setEditing(null);
          }}
          className={PRIMARY_BTN}
        >
          {creating ? <X className="size-4" /> : <Plus className="size-4" />}
          {creating ? "Cancel" : "New code"}
        </button>
      </div>

      {creating ? (
        <NewDiscountForm
          onCreated={(row) => {
            setRows((rs) => [row, ...rs]);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-coco-pink-soft bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-coco-pink-soft bg-coco-beige/70 text-left text-xs font-semibold uppercase tracking-wide text-coco-brown-medium">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Used</th>
              <th className="px-4 py-3">Triggers</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-coco-brown-medium">
                  No discount rules yet — add one with “New code” or run the import script.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-coco-pink-soft/70 transition-colors hover:bg-coco-beige/40"
              >
                <td className="px-4 py-3 font-mono font-medium text-coco-brown">{r.code}</td>
                <td className="px-4 py-3 tabular-nums">
                  {r.value_type === "percentage"
                    ? `${Math.abs(r.value).toFixed(0)}%`
                    : `$${Math.abs(r.value).toFixed(2)}`}
                </td>
                <td className="px-4 py-3 capitalize text-coco-brown-medium">{r.discount_class}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 tabular-nums text-coco-brown-medium">
                  {r.times_used}
                  {r.usage_limit_per_code ? ` / ${r.usage_limit_per_code}` : ""}
                </td>
                <td className="px-4 py-3 text-xs text-coco-brown-medium">
                  {r.intent_triggers && r.intent_triggers.length > 0 ? r.intent_triggers.join(", ") : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-coco-brown-medium">
                  {r.product_line_scope && r.product_line_scope.length > 0 ? r.product_line_scope.join(", ") : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-coco-pink-dark/40 px-2.5 py-1 text-xs font-medium text-coco-brown transition-colors hover:bg-coco-pink-soft"
                    onClick={() => {
                      setEditing(editing === r.id ? null : r.id);
                      setCreating(false);
                    }}
                  >
                    {editing === r.id ? (
                      <>
                        <X className="size-3" /> Cancel
                      </>
                    ) : (
                      <>
                        <Pencil className="size-3" /> Edit
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
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
    </div>
  );
}

function StatusBadge({ status }: { status: Row["status"] }) {
  const pill =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : status === "paused"
        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
        : "bg-stone-100 text-stone-600 ring-stone-500/20";
  const dot =
    status === "active" ? "bg-emerald-500" : status === "paused" ? "bg-amber-500" : "bg-stone-400";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${pill}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

const FIELD_CLASS =
  "w-full rounded-lg border border-coco-pink-dark/40 bg-white px-3 py-2 text-coco-brown outline-none transition-colors focus:border-coco-golden focus:ring-2 focus:ring-coco-golden/30";
const LABEL_CLASS = "mb-1 text-xs font-medium uppercase tracking-wide text-coco-brown-medium";

function NewDiscountForm({
  onCreated,
  onCancel,
}: {
  onCreated: (row: Row) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [valueType, setValueType] = useState<Row["value_type"]>("percentage");
  const [discountClass, setDiscountClass] = useState<Row["discount_class"]>("order");
  const [status, setStatus] = useState<Row["status"]>("active");
  const [usageLimit, setUsageLimit] = useState("");
  const [intent, setIntent] = useState("");
  const [scope, setScope] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const numericValue = Number(value);
      if (!code.trim()) throw new Error("Code is required");
      if (!Number.isFinite(numericValue)) throw new Error("Value must be a number");
      if (numericValue === 0) throw new Error("Discount value must not be zero");
      const limit = usageLimit.trim().length > 0 ? Number(usageLimit) : null;
      if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
        throw new Error("Usage limit must be a positive whole number");
      }

      const res = await fetch("/api/chatbot/admin/discounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          value: numericValue,
          value_type: valueType,
          discount_class: discountClass,
          status,
          usage_limit_per_code: limit,
          intent_triggers: parseList(intent),
          product_line_scope: parseList(scope),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      onCreated(body.row as Row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-coco-pink-soft bg-coco-beige/60 p-5 text-sm shadow-sm">
      <h3 className="mb-3 font-semibold text-coco-brown">New discount code</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <div className={LABEL_CLASS}>Code</div>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME10"
            className={`${FIELD_CLASS} font-mono`}
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Value</div>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="10"
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Value type</div>
          <select
            value={valueType}
            onChange={(e) => setValueType(e.target.value as Row["value_type"])}
            className={FIELD_CLASS}
          >
            <option value="percentage">percentage</option>
            <option value="fixed_amount">fixed_amount</option>
          </select>
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Class</div>
          <select
            value={discountClass}
            onChange={(e) => setDiscountClass(e.target.value as Row["discount_class"])}
            className={FIELD_CLASS}
          >
            <option value="order">order</option>
            <option value="product">product</option>
            <option value="shipping">shipping</option>
          </select>
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Status</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Row["status"])}
            className={FIELD_CLASS}
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="expired">expired</option>
          </select>
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Usage limit (optional)</div>
          <input
            type="number"
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value)}
            placeholder="unlimited"
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Intent triggers (comma-separated)</div>
          <input
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder={INTENT_OPTIONS.join(", ")}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Product handles (comma-separated)</div>
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="violet, dahlia, rose"
            className={FIELD_CLASS}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={PRIMARY_BTN}
        >
          {saving ? "Creating…" : "Create code"}
        </button>
        <button type="button" onClick={onCancel} className={GHOST_BTN}>
          Cancel
        </button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
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
          value: draft.value,
          value_type: draft.value_type,
          discount_class: draft.discount_class,
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
    <div className="border-t border-coco-pink-soft bg-coco-beige/60 p-5 text-sm">
      <h3 className="mb-3 font-semibold text-coco-brown">Edit {draft.code}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <div className={LABEL_CLASS}>Value</div>
          <input
            type="number"
            value={draft.value}
            onChange={(e) => {
              const raw = e.target.value;
              const num = Number(raw);
              // Empty field → 0 (keeps the input editable); non-numeric junk →
              // keep the previous value. Never store NaN.
              setDraft((d) => ({
                ...d,
                value: raw === "" ? 0 : Number.isNaN(num) ? d.value : num,
              }));
            }}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Value type</div>
          <select
            value={draft.value_type}
            onChange={(e) => setDraft((d) => ({ ...d, value_type: e.target.value as Row["value_type"] }))}
            className={FIELD_CLASS}
          >
            <option value="percentage">percentage</option>
            <option value="fixed_amount">fixed_amount</option>
          </select>
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Class</div>
          <select
            value={draft.discount_class}
            onChange={(e) =>
              setDraft((d) => ({ ...d, discount_class: e.target.value as Row["discount_class"] }))
            }
            className={FIELD_CLASS}
          >
            <option value="order">order</option>
            <option value="product">product</option>
            <option value="shipping">shipping</option>
          </select>
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Status</div>
          <select
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Row["status"] }))}
            className={FIELD_CLASS}
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="expired">expired</option>
          </select>
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Intent triggers (comma-separated)</div>
          <input
            type="text"
            value={(draft.intent_triggers ?? []).join(", ")}
            onChange={(e) =>
              setDraft((d) => ({ ...d, intent_triggers: parseList(e.target.value) }))
            }
            placeholder={INTENT_OPTIONS.join(", ")}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>Product handles (comma-separated)</div>
          <input
            type="text"
            value={(draft.product_line_scope ?? []).join(", ")}
            onChange={(e) =>
              setDraft((d) => ({ ...d, product_line_scope: parseList(e.target.value) }))
            }
            placeholder="violet, dahlia, rose"
            className={FIELD_CLASS}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={PRIMARY_BTN}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className={GHOST_BTN}>
          Cancel
        </button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
