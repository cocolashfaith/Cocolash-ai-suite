"use client";

import { useState } from "react";
import type { VoiceFragments } from "@/lib/chat/types";

const FIELDS: Array<{ key: keyof VoiceFragments; label: string; rows: number }> = [
  { key: "persona_name", label: "Persona name", rows: 1 },
  { key: "greeting", label: "Greeting (first message Coco sends)", rows: 2 },
  { key: "recommend_intro", label: "Product recommendation opener", rows: 3 },
  { key: "escalation", label: "Escalation (handing off to support@cocolash.com)", rows: 3 },
  { key: "after_hours_suffix", label: "After-hours suffix (Mon–Fri 9–5 EST)", rows: 2 },
  { key: "lead_capture", label: "Lead capture invite", rows: 3 },
  { key: "tryon_offer", label: "Try-on offer ({product} placeholder)", rows: 2 },
  { key: "dont_know", label: "“Don't know” fallback", rows: 2 },
];

export function VoiceForm({ initial }: { initial: VoiceFragments }) {
  const [state, setState] = useState<VoiceFragments>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/chatbot/admin/voice", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
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
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <div className="mb-1 text-sm font-medium text-coco-brown">{f.label}</div>
          {f.rows === 1 ? (
            <input
              type="text"
              value={state[f.key]}
              onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
              className="w-full rounded-md border border-coco-pink-soft px-2 py-1 text-sm"
            />
          ) : (
            <textarea
              rows={f.rows}
              value={state[f.key]}
              onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))}
              className="w-full rounded-md border border-coco-pink-soft px-2 py-1 text-sm leading-relaxed"
            />
          )}
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-md bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save voice"}
        </button>
        {status === "saved" ? <span className="text-sm text-coco-brown-medium">Saved ✓</span> : null}
        {status === "error" ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </form>
  );
}
