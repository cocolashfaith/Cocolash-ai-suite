"use client";

import { useState } from "react";

interface Initial {
  bot_enabled: boolean;
  daily_cap_usd: number;
  default_top_k: number;
  system_prompt_version: string;
  embedding_model: string;
  updated_at: string;
}

export function SettingsForm({ initial }: { initial: Initial }) {
  const [state, setState] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/chatbot/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bot_enabled: state.bot_enabled,
          daily_cap_usd: state.daily_cap_usd,
          default_top_k: state.default_top_k,
          system_prompt_version: state.system_prompt_version,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      setStatus("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-md border border-coco-pink-soft bg-white p-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={state.bot_enabled}
          onChange={(e) => setState((s) => ({ ...s, bot_enabled: e.target.checked }))}
        />
        <span className="text-sm font-medium text-coco-brown">Bot enabled (kill switch)</span>
      </label>

      <Field label="Daily cap (USD)">
        <input
          type="number"
          min={0}
          step={0.01}
          value={state.daily_cap_usd}
          onChange={(e) => setState((s) => ({ ...s, daily_cap_usd: Number(e.target.value) }))}
          className="w-full rounded-md border border-coco-pink-soft px-2 py-1 text-sm"
        />
      </Field>

      <Field label="Default top-K (retrieval)">
        <input
          type="number"
          min={1}
          max={20}
          value={state.default_top_k}
          onChange={(e) => setState((s) => ({ ...s, default_top_k: Number(e.target.value) }))}
          className="w-full rounded-md border border-coco-pink-soft px-2 py-1 text-sm"
        />
      </Field>

      <Field label="System prompt version">
        <input
          type="text"
          value={state.system_prompt_version}
          onChange={(e) => setState((s) => ({ ...s, system_prompt_version: e.target.value }))}
          className="w-full rounded-md border border-coco-pink-soft px-2 py-1 text-sm font-mono"
          pattern="v\d+\.\d+\.\d+"
        />
      </Field>

      <Field label="Embedding model (read-only)">
        <input
          type="text"
          value={state.embedding_model}
          readOnly
          className="w-full rounded-md border border-coco-pink-soft bg-coco-beige px-2 py-1 text-sm font-mono"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-md bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" ? <span className="text-sm text-coco-brown-medium">Saved ✓</span> : null}
        {status === "error" ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
      {state.updated_at ? (
        <p className="text-xs text-coco-brown-medium">Last updated: {state.updated_at}</p>
      ) : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-coco-brown">{label}</div>
      {children}
    </label>
  );
}
