import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "../chatbot/admin/account/account-form";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-coco-brown">Account</h1>
        <p className="mt-1 text-sm text-coco-brown-medium">
          Change your password and manage who can sign in.
        </p>
      </div>

      <AccountForm email={user?.email ?? null} />

      <Link
        href="/chatbot/admin/admins"
        className="flex items-center gap-3 rounded-2xl border border-coco-pink-soft bg-white px-5 py-4 text-sm text-coco-brown shadow-sm transition-colors hover:bg-coco-pink-soft"
      >
        <ShieldCheck className="size-5 shrink-0 text-coco-golden-dark" />
        <span>
          <span className="font-medium">See who has access</span> — view, add, or remove logins in
          Manage Admins.
        </span>
        <span className="ml-auto text-coco-brown-medium">→</span>
      </Link>
    </div>
  );
}
