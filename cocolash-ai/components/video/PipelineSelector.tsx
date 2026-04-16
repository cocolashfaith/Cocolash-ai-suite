"use client";

import { cn } from "@/lib/utils";
import { Film, Smartphone, Sparkles, Check } from "lucide-react";
import type { VideoPipeline } from "@/lib/types";

interface PipelineSelectorProps {
  onSelect: (pipeline: VideoPipeline) => void;
}

const PIPELINES: {
  value: VideoPipeline;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  cost: string;
  icon: React.ElementType;
  bullets: string[];
}[] = [
  {
    value: "heygen",
    title: "Brand Content Studio",
    description:
      "Educational videos, tutorials & brand storytelling. Consistent talking-head delivery with clear speech.",
    badge: "Educational",
    badgeColor: "bg-coco-beige text-coco-brown-medium",
    cost: "~$0.50/video",
    icon: Film,
    bullets: [
      "Tutorials, FAQs, brand stories & product education",
      "300+ voices & accents, 30-90s durations",
      "Consistent, professional presenter output",
    ],
  },
  {
    value: "seedance",
    title: "Seedance 2.0 Pipeline",
    description:
      "Authentic UGC-style videos with iPhone aesthetic. AI speaks your script or lip-syncs your voice. Best for TikTok/Reels ad creatives.",
    badge: "New",
    badgeColor: "bg-coco-golden/20 text-coco-golden",
    cost: "~$3.15/video",
    icon: Smartphone,
    bullets: [
      "iPhone-style UGC aesthetic",
      "AI speaks or lip-syncs your audio",
      "3-step wizard, no composition needed",
    ],
  },
];

export function PipelineSelector({ onSelect }: PipelineSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-bold text-coco-brown">
          Choose Your Video Engine
        </h2>
        <p className="mt-1 text-sm text-coco-brown-medium/60">
          Select the pipeline that best fits your content style
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PIPELINES.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onSelect(p.value)}
              className="group flex flex-col rounded-2xl border-2 border-coco-beige-dark bg-white p-5 text-left transition-all duration-200 hover:border-coco-golden/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-coco-golden/10 text-coco-golden transition-colors group-hover:bg-coco-golden group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                    p.badgeColor
                  )}
                >
                  {p.badge}
                </span>
              </div>

              <h3 className="mt-4 text-sm font-bold text-coco-brown">
                {p.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-coco-brown-medium/60">
                {p.description}
              </p>

              <ul className="mt-4 space-y-2">
                {p.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-[11px] text-coco-brown-medium"
                  >
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-coco-golden" />
                    {b}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-4">
                <div className="flex items-center justify-between rounded-xl bg-coco-beige/50 px-3 py-2.5">
                  <span className="text-[10px] font-medium text-coco-brown-medium/50">
                    Est. cost
                  </span>
                  <span className="text-sm font-bold text-coco-brown">
                    {p.cost}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-coco-golden/10 py-2.5 text-xs font-semibold text-coco-golden transition-colors group-hover:bg-coco-golden group-hover:text-white">
                <Sparkles className="h-3.5 w-3.5" />
                Select {p.value === "heygen" ? "Brand Content" : "Seedance"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
