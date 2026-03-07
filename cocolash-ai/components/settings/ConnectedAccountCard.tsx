"use client";

import { Badge } from "@/components/ui/badge";
import type { SocialAccount } from "@/lib/types";
import {
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Music2,
  Globe,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const PLATFORM_CONFIG: Record<
  string,
  { color: string; bg: string; icon: LucideIcon; label: string }
> = {
  instagram: {
    color: "text-purple-600",
    bg: "bg-gradient-to-br from-purple-500 to-pink-500",
    icon: Instagram,
    label: "Instagram",
  },
  tiktok: {
    color: "text-gray-900",
    bg: "bg-black",
    icon: Music2,
    label: "TikTok",
  },
  twitter: {
    color: "text-blue-500",
    bg: "bg-blue-500",
    icon: Twitter,
    label: "X / Twitter",
  },
  facebook: {
    color: "text-blue-700",
    bg: "bg-blue-700",
    icon: Facebook,
    label: "Facebook",
  },
  linkedin: {
    color: "text-blue-600",
    bg: "bg-blue-600",
    icon: Linkedin,
    label: "LinkedIn",
  },
};

const DEFAULT_CONFIG = {
  color: "text-gray-500",
  bg: "bg-gray-500",
  icon: Globe,
  label: "Other",
};

interface ConnectedAccountCardProps {
  account: SocialAccount;
}

export function ConnectedAccountCard({ account }: ConnectedAccountCardProps) {
  const config = PLATFORM_CONFIG[account.platform] ?? DEFAULT_CONFIG;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-coco-pink-dark/15 bg-white p-3 transition-shadow hover:shadow-sm">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.bg} text-white`}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-coco-brown">
            {account.account_name || config.label}
          </span>
          {account.is_active ? (
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
            >
              Active
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="shrink-0 border-gray-200 bg-gray-50 text-[10px] text-gray-500"
            >
              Inactive
            </Badge>
          )}
        </div>
        {account.account_handle && (
          <p className={`truncate text-xs ${config.color}`}>
            {account.account_handle.startsWith("@")
              ? account.account_handle
              : `@${account.account_handle}`}
          </p>
        )}
      </div>
    </div>
  );
}
