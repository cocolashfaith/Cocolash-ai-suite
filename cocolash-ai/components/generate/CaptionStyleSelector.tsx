"use client";

import type { CaptionStyle } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STYLE_OPTIONS: { value: CaptionStyle; label: string; desc: string }[] = [
  { value: "casual", label: "Casual", desc: "Conversational, friend-to-friend" },
  { value: "professional", label: "Professional", desc: "Polished, brand-forward" },
  { value: "promotional", label: "Promotional", desc: "Urgency-driven, strong CTA" },
  { value: "storytelling", label: "Storytelling", desc: "Narrative, emotional" },
  { value: "question", label: "Question-based", desc: "Scroll-stopping opener" },
];

interface CaptionStyleSelectorProps {
  value: CaptionStyle;
  onChange: (value: CaptionStyle) => void;
}

export function CaptionStyleSelector({
  value,
  onChange,
}: CaptionStyleSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-coco-brown">
        Caption Style
      </label>
      <Select value={value} onValueChange={(v) => onChange(v as CaptionStyle)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STYLE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{opt.label}</span>
                <span className="text-xs text-muted-foreground">
                  {opt.desc}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
