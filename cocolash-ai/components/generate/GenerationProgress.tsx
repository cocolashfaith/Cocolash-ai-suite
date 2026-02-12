"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const CYCLING_MESSAGES = [
  "Composing your scene...",
  "Selecting the perfect lighting...",
  "Applying CocoLash magic...",
  "Crafting your luxury image...",
  "Fine-tuning the details...",
  "Almost there...",
];

interface GenerationProgressProps {
  /** Whether the progress overlay is visible */
  isVisible: boolean;
}

export function GenerationProgress({ isVisible }: GenerationProgressProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setMessageIndex(0);
      setElapsed(0);
      return;
    }

    // Cycle messages every 3 seconds
    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % CYCLING_MESSAGES.length);
    }, 3000);

    // Track elapsed time
    const timerInterval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(msgInterval);
      clearInterval(timerInterval);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-coco-brown/60 backdrop-blur-sm">
      <div className="mx-4 flex max-w-sm flex-col items-center gap-6 rounded-2xl bg-white p-8 shadow-2xl">
        {/* Pulsing logo icon */}
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-coco-golden/20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-coco-golden/10">
            <Sparkles className="h-8 w-8 animate-pulse text-coco-golden" />
          </div>
        </div>

        {/* Cycling message */}
        <div className="text-center">
          <p className="text-lg font-semibold text-coco-brown transition-all duration-500">
            {CYCLING_MESSAGES[messageIndex]}
          </p>
          <p className="mt-2 text-sm text-coco-brown-medium">
            Usually takes 5–15 seconds
          </p>
        </div>

        {/* Elapsed timer */}
        <div className="flex items-center gap-2 text-xs text-coco-brown-medium/60">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-coco-golden" />
          {elapsed}s elapsed
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-coco-beige">
          <div
            className="h-full animate-pulse rounded-full bg-gradient-to-r from-coco-golden to-coco-pink transition-all duration-1000"
            style={{ width: `${Math.min(95, elapsed * 4)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
