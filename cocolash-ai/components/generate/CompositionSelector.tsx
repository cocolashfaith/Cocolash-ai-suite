"use client";

import { User, Users, UsersRound } from "lucide-react";
import type { Composition, ContentCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CompositionSelectorProps {
  value: Composition;
  onChange: (value: Composition) => void;
  category: ContentCategory;
}

const COMPOSITIONS: {
  value: Composition;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "solo", label: "Solo", description: "Single person portrait", icon: User },
  { value: "duo", label: "Duo", description: "Two people together", icon: Users },
  { value: "group", label: "Group", description: "3-5 people together", icon: UsersRound },
];

export function CompositionSelector({
  value,
  onChange,
  category,
}: CompositionSelectorProps) {
  // Only show for lifestyle category
  if (category !== "lifestyle") return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Composition
      </label>
      <div className="grid grid-cols-3 gap-3">
        {COMPOSITIONS.map((comp) => {
          const Icon = comp.icon;
          const isActive = value === comp.value;
          return (
            <button
              key={comp.value}
              type="button"
              onClick={() => onChange(comp.value)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 p-3 transition-all duration-200",
                isActive
                  ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                  : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                  isActive
                    ? "bg-coco-golden text-white"
                    : "bg-coco-beige text-coco-brown-medium"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isActive ? "text-coco-brown" : "text-coco-brown-medium"
                  )}
                >
                  {comp.label}
                </p>
                <p className="text-[11px] text-coco-brown-medium/70">
                  {comp.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
