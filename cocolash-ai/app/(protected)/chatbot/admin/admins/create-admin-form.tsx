"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, ShieldCheck } from "lucide-react";

const FIELD =
  "w-full rounded-lg border border-coco-pink-dark/40 bg-white px-3 py-2 text-sm text-coco-brown outline-none transition-colors focus:border-coco-golden focus:ring-2 focus:ring-coco-golden/30";
const LABEL = "mb-1 text-xs font-medium uppercase tracking-wide text-coco-brown-medium";
const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream shadow-sm transition-colors hover:bg-coco-brown-light disabled:opacity-50";

interface Created {
  email: string;
  role: string;
  password: string;
}

export function CreateAdminForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"team" | "owner">("team");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setSaving(true);
    try {
      const res = await fetch("/api/chatbot/admin/admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          role,
          password: password.trim() ? password.trim() : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? "Couldn't create the login.");
        return;
      }
      setCreated({ email: body.email, role: body.role, password: body.password });
      setEmail("");
      setPassword("");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-coco-pink-soft bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-coco-brown">
        <UserPlus className="size-5 text-coco-golden-dark" />
        <h2 className="font-semibold">Create a login</h2>
      </div>
      <p className="text-sm text-coco-brown-medium">
        Give someone their own login to the dashboard. They can change their password anytime under{" "}
        <span className="font-medium">Account</span>, and you can revoke access here whenever you
        want.
      </p>

      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <div className={LABEL}>Email</div>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className={FIELD}
          />
        </label>
        <label className="block">
          <div className={LABEL}>Role</div>
          <select value={role} onChange={(e) => setRole(e.target.value as "team" | "owner")} className={FIELD}>
            <option value="team">Team member</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <label className="block sm:col-span-3">
          <div className={LABEL}>Temporary password (optional — leave blank to auto-generate)</div>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Auto-generated if left blank"
            className={FIELD}
          />
        </label>
        <div className="sm:col-span-3">
          <button type="submit" disabled={saving} className={PRIMARY}>
            {saving ? "Creating…" : "Create login"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {created ? (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-emerald-800">
            <ShieldCheck className="size-4" /> Login created
          </div>
          <p className="text-emerald-900">
            Share these once, securely (not over email/chat if you can avoid it). Ask them to change
            the password under Account after their first sign-in.
          </p>
          <div className="rounded-md bg-white/70 p-3 font-mono text-xs text-coco-brown">
            <div>email: {created.email}</div>
            <div>password: {created.password}</div>
            <div>role: {created.role}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
