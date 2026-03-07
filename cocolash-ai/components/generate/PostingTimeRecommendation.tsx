"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNextOptimalTime } from "@/lib/constants/posting-times";
import type { Platform } from "@/lib/types";

interface PostingTimeRecommendationProps {
  platform: Platform;
  onSelectTime: (time: Date) => void;
}

export function PostingTimeRecommendation({
  platform,
  onSelectTime,
}: PostingTimeRecommendationProps) {
  const nextTime = useMemo(() => getNextOptimalTime(platform), [platform]);

  const formattedTime = nextTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const isToday =
    nextTime.toDateString() === new Date().toDateString();

  const label = isToday ? `Today at ${formattedTime}` : `Tomorrow at ${formattedTime}`;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-coco-beige/40 px-3 py-2">
      <Clock className="h-3.5 w-3.5 shrink-0 text-coco-golden" />
      <span className="flex-1 text-xs text-coco-brown-medium">
        Best time to post: <strong className="text-coco-brown">{label}</strong>
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSelectTime(nextTime)}
        className="h-6 px-2 text-[10px] text-coco-golden hover:text-coco-golden-dark"
      >
        Use this time
      </Button>
    </div>
  );
}
