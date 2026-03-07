"use client";

import type { Platform } from "@/lib/types";
import { PLATFORM_LIMITS } from "@/lib/constants/posting-times";
import { Badge } from "@/components/ui/badge";
import {
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Music2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const PLATFORMS: {
  value: Platform;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}[] = [
  { value: "instagram", label: "Instagram", icon: Instagram, color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  { value: "tiktok", label: "TikTok", icon: Music2, color: "text-gray-900", bg: "bg-gray-50 border-gray-300" },
  { value: "twitter", label: "X / Twitter", icon: Twitter, color: "text-blue-500", bg: "bg-blue-50 border-blue-200" },
  { value: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-700", bg: "bg-blue-50 border-blue-300" },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
];

interface PlatformSelectorProps {
  selected: Platform[];
  onChange: (platforms: Platform[]) => void;
}

export function PlatformSelector({ selected, onChange }: PlatformSelectorProps) {
  const toggle = (p: Platform) => {
    if (selected.includes(p)) {
      onChange(selected.filter((s) => s !== p));
    } else {
      onChange([...selected, p]);
    }
  };

  const selectAll = () => {
    if (selected.length === PLATFORMS.length) {
      onChange([]);
    } else {
      onChange(PLATFORMS.map((p) => p.value));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-coco-brown">
          Platforms
        </label>
        <button
          type="button"
          onClick={selectAll}
          className="text-[10px] font-medium text-coco-golden hover:underline"
        >
          {selected.length === PLATFORMS.length ? "Deselect All" : "Select All"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PLATFORMS.map((p) => {
          const isSelected = selected.includes(p.value);
          const limits = PLATFORM_LIMITS[p.value];
          const Icon = p.icon;

          return (
            <button
              key={p.value}
              type="button"
              onClick={() => toggle(p.value)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                isSelected
                  ? `${p.bg} ring-1 ring-current ${p.color}`
                  : "border-coco-beige-dark bg-white text-coco-brown-medium hover:bg-coco-beige/30"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isSelected ? p.color : ""}`} />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {p.label}
                </span>
                <span className="block text-[9px] opacity-60">
                  {limits.caption} chars · {limits.hashtags} tags
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-[10px] text-red-500">
          Select at least one platform
        </p>
      )}
    </div>
  );
}
