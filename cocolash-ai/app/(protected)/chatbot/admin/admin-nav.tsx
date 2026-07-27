"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Percent,
  MessageCircle,
  BookOpen,
  MessagesSquare,
  BarChart3,
  Inbox,
  Sparkles,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/chatbot/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/chatbot/admin/discounts", label: "Discounts", icon: Percent },
  { href: "/chatbot/admin/voice", label: "Voice", icon: MessageCircle },
  { href: "/chatbot/admin/content", label: "Knowledge", icon: BookOpen },
  { href: "/chatbot/admin/transcripts", label: "Transcripts", icon: MessagesSquare },
  { href: "/chatbot/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/chatbot/admin/leads", label: "Leads", icon: Inbox },
  { href: "/chatbot/admin/prompts", label: "AI Prompts", icon: Sparkles },
  { href: "/chatbot/admin/settings", label: "Settings", icon: Settings },
  { href: "/chatbot/admin/admins", label: "Manage Admins", icon: ShieldCheck },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => {
        // Overview matches exactly; sub-pages match by prefix.
        const active =
          n.href === "/chatbot/admin"
            ? pathname === n.href
            : pathname.startsWith(n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={[
              "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-coco-brown text-coco-cream shadow-sm"
                : "text-coco-brown-medium hover:bg-coco-pink-soft hover:text-coco-brown",
            ].join(" ")}
          >
            <Icon
              className={[
                "size-4 shrink-0 transition-colors",
                active ? "text-coco-golden" : "text-coco-brown-medium group-hover:text-coco-golden-dark",
              ].join(" ")}
            />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
