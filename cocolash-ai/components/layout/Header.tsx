"use client";

import { usePathname, useRouter } from "next/navigation";
import { Sparkles, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

/**
 * Header — Mobile-only top bar with brand identity and logout.
 * Hidden on desktop where sidebar is visible.
 */

const pageTitles: Record<string, string> = {
  "/generate": "Generate",
  "/gallery": "Gallery",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const title = pageTitles[pathname] || "CocoLash AI";

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-coco-pink-dark/20 bg-coco-beige/80 px-4 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-coco-brown">
          <Sparkles className="h-4 w-4 text-coco-golden" />
        </div>
        <span className="text-sm font-bold text-coco-brown">{title}</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="h-8 text-coco-brown-medium hover:bg-coco-pink/50 hover:text-coco-brown"
      >
        {isLoggingOut ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="h-4 w-4" />
        )}
      </Button>
    </header>
  );
}
