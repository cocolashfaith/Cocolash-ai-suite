"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sparkles, Images, Heart, Settings, Video } from "lucide-react";

/**
 * MobileNav — Bottom navigation bar for mobile/tablet screens.
 * Shows 4 nav items with icons and labels. Visible only below md breakpoint.
 */
const navItems = [
  { label: "Generate", href: "/generate", icon: Sparkles },
  { label: "Gallery", href: "/gallery", icon: Images },
  { label: "Video", href: "/video", icon: Video },
  { label: "Favorites", href: "/favorites", icon: Heart },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-coco-brown-light/30 bg-coco-brown md:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors",
                isActive
                  ? "text-coco-golden"
                  : "text-coco-beige/50 active:text-coco-beige"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5",
                  isActive ? "text-coco-golden" : "text-coco-beige/50"
                )}
              />
              {item.label}
              {isActive && (
                <div className="absolute bottom-0 h-0.5 w-12 rounded-full bg-coco-golden" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
