"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Images,
  Heart,
  Settings,
  LogOut,
  Loader2,
  Shield,
  Video,
} from "lucide-react";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

/**
 * Navigation items for the sidebar.
 * Icons are from lucide-react. href matches route groups under (protected).
 */
const navItems = [
  {
    label: "Generate",
    href: "/generate",
    icon: Sparkles,
    description: "Create new images",
  },
  {
    label: "Gallery",
    href: "/gallery",
    icon: Images,
    description: "View generated images",
  },
  {
    label: "Video",
    href: "/video",
    icon: Video,
    description: "Create AI avatar videos",
  },
  {
    label: "Favorites",
    href: "/favorites",
    icon: Heart,
    description: "Your saved favorite images",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Brand profile & preferences",
  },
];

interface UserInfo {
  email: string;
  fullName: string | null;
  isAdmin: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setUserInfo({
            email: d.user.email,
            fullName: d.user.fullName,
            isAdmin: d.isAdmin,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      await fetch("/api/auth", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  };

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-50">
      <div className="flex h-full flex-col bg-coco-brown">
        {/* Logo / Brand */}
        <div className="flex h-16 items-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-coco-golden/20">
            <Sparkles className="h-5 w-5 text-coco-golden" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-coco-beige">
              CocoLash
            </h2>
            <p className="text-[11px] font-medium text-coco-golden">
              AI Studio
            </p>
          </div>
        </div>

        <Separator className="bg-coco-brown-light/50" />

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 px-3 pt-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-coco-golden/15 text-coco-golden"
                        : "text-coco-beige/70 hover:bg-coco-brown-light hover:text-coco-beige"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-5 w-5 shrink-0 transition-colors",
                        isActive
                          ? "text-coco-golden"
                          : "text-coco-beige/50 group-hover:text-coco-beige"
                      )}
                    />
                    {item.label}
                    {isActive && (
                      <div className="ml-auto h-1.5 w-1.5 rounded-full bg-coco-golden" />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.description}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-3">
          <Separator className="mb-3 bg-coco-brown-light/50" />

          {userInfo && (
            <div className="mb-2 flex items-center gap-2.5 rounded-lg px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coco-golden/20 text-xs font-bold text-coco-golden">
                {(userInfo.fullName || userInfo.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-coco-beige">
                  {userInfo.fullName || userInfo.email.split("@")[0]}
                </p>
                <div className="flex items-center gap-1">
                  {userInfo.isAdmin && (
                    <Shield className="h-2.5 w-2.5 text-coco-golden" />
                  )}
                  <p className="truncate text-[10px] text-coco-beige/40">
                    {userInfo.email}
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-coco-beige/50 transition-all hover:bg-coco-brown-light hover:text-coco-beige disabled:opacity-50"
          >
            {isLoggingOut ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <LogOut className="h-5 w-5" />
            )}
            {isLoggingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
