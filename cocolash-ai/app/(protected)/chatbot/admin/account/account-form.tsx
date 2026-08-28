"use client";

import { useState } from "react";
import { KeyRound, CheckCircle2 } from "lucide-react";

const FIELD =
  "w-full rounded-lg border border-coco-pink-dark/40 bg-white px-3 py-2 text-coco-brown outline-none transition-colors focus:border-coco-golden focus:ring-2 focus:ring-coco-golden/30";
const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream shadow-sm transition-colors hover:bg-coco-brown-light disabled:opacity-50";

export function AccountForm({ email }: { email: string | null }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/chatbot/admin/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: pw }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? "Couldn't update the password.");
        return;
      }
      setDone(true);
      setPw("");
      setConfirm("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md space-y-5 rounded-2xl border border-coco-pink-soft bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-coco-brown">
        <KeyRound className="size-5 text-coco-golden-dark" />
        <h2 className="font-semibold">Change your password</h2>
      </div>

      {email ? (
        <p className="text-sm text-coco-brown-medium">
          Signed in as <span className="font-medium text-coco-brown">{email}</span>. Set a new
          password below — only you will know it.
        </p>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You&rsquo;re signed in with the shared access password, so there&rsquo;s no personal
          password to change here. Ask an owner to create you an individual login under{" "}
          <span className="font-medium">Manage Admins</span>, then come back to set your own
          password.
        </p>
      )}

      {email ? (
        <form onSubmit={save} className="space-y-4">
          <label className="block">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-coco-brown-medium">
              New password
            </div>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={FIELD}
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-coco-brown-medium">
              Confirm new password
            </div>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="Re-enter it"
              className={FIELD}
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {done ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> Password updated. Use it next time you sign in.
            </p>
          ) : null}

          <button type="submit" disabled={saving} className={PRIMARY}>
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
