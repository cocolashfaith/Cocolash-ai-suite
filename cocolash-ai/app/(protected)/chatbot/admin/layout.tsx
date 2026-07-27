import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageCircleHeart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isChatAdmin } from "@/lib/chat/admin-auth";
import { AdminNav } from "./admin-nav";

function AccessDenied({ email }: { email: string | null }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-coco-pink-soft bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-coco-brown">Admin access required</h1>
      <p className="text-sm text-coco-brown-medium">
        You&rsquo;re signed in
        {email ? (
          <>
            {" "}
            as <span className="font-medium text-coco-brown">{email}</span>
          </>
        ) : null}
        , but this account doesn&rsquo;t have access to the Coco chatbot admin
        panel yet.
      </p>
      <p className="text-sm text-coco-brown-medium">
        Ask a CocoLash admin to grant you access (they can add you under{" "}
        <span className="font-medium">Manage Admins</span>), then reload this
        page.
      </p>
      <div className="flex items-center justify-center gap-3 pt-2">
        <Link
          href="/"
          className="rounded-lg bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream transition-colors hover:bg-coco-brown-light"
        >
          Back to app
        </Link>
        <Link href="/chatbot" className="text-sm text-coco-brown-medium underline">
          Open the chatbot
        </Link>
      </div>
    </div>
  );
}

export default async function ChatbotAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // isChatAdmin now also accepts the shared access-password cookie, so an
  // access-password session no longer bounces to /login → /generate. Only fall
  // back to login when there is neither an admin session nor a Supabase user.
  const ok = await isChatAdmin(supabase);
  if (!ok) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/login?next=/chatbot/admin");
    }
    return (
      <div className="px-4 py-10">
        <AccessDenied email={user.email ?? null} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-col gap-3 border-b border-coco-pink-soft pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-coco-brown text-coco-golden shadow-sm">
            <MessageCircleHeart className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight text-coco-brown">
              Coco Admin
            </h1>
            <p className="text-xs text-coco-brown-medium">
              Manage your CocoLash chatbot
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/chatbot"
            className="rounded-lg border border-coco-pink-dark/40 bg-white px-3 py-1.5 text-sm font-medium text-coco-brown transition-colors hover:bg-coco-pink-soft"
          >
            Open chatbot
          </Link>
          <Link
            href="/generate"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-coco-brown-medium transition-colors hover:text-coco-brown"
          >
            <ArrowLeft className="size-4" />
            Back to app
          </Link>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[210px_1fr]">
        <aside className="md:sticky md:top-6 md:self-start">
          <div className="rounded-2xl border border-coco-pink-soft bg-white p-2 shadow-sm">
            <AdminNav />
          </div>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
