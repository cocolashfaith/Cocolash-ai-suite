import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isChatAdmin } from "@/lib/chat/admin-auth";

const NAV: Array<{ href: string; label: string }> = [
  { href: "/chatbot/admin", label: "Overview" },
  { href: "/chatbot/admin/discounts", label: "Discounts" },
  { href: "/chatbot/admin/voice", label: "Voice" },
  { href: "/chatbot/admin/content", label: "Knowledge" },
  { href: "/chatbot/admin/transcripts", label: "Transcripts" },
  { href: "/chatbot/admin/analytics", label: "Analytics" },
  { href: "/chatbot/admin/leads", label: "Leads" },
  { href: "/chatbot/admin/prompts", label: "AI Prompts" },
  { href: "/chatbot/admin/settings", label: "Settings" },
  { href: "/chatbot/admin/admins", label: "Manage Admins" },
];

function AccessDenied({ email }: { email: string | null }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-coco-pink-soft bg-white p-8 text-center">
      <h1 className="text-2xl font-bold text-coco-brown">
        Admin access required
      </h1>
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
          className="rounded-md bg-coco-brown px-4 py-2 text-sm font-medium text-coco-cream"
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

  // Distinguish "not signed in" (→ login) from "signed in but not an admin"
  // (→ explicit Access Denied). Previously both cases redirected to /login,
  // which bounced authenticated non-admins (like Faith) to the main app and
  // looked like the link was broken.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/chatbot/admin");
  }

  const ok = await isChatAdmin(supabase);
  if (!ok) {
    return <AccessDenied email={user.email ?? null} />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <aside className="md:sticky md:top-6 md:self-start">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-coco-brown-medium">
          Coco admin
        </h2>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-2 text-sm text-coco-brown hover:bg-coco-pink-soft"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
