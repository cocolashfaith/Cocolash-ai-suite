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
  { href: "/chatbot/admin/settings", label: "Settings" },
];

export default async function ChatbotAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const ok = await isChatAdmin(supabase);
  if (!ok) {
    redirect("/login?next=/chatbot/admin");
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
