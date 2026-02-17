"use client";

import { useEffect, useState } from "react";
import type { ContentCategory, ImageResolution } from "@/lib/types";

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
  /** Current category for dynamic timing estimate */
  category?: ContentCategory;
  /** Whether Before/After composite is enabled */
  includeComposite?: boolean;
  /** Current resolution */
  resolution?: ImageResolution;
  /** Current composition (for group shots) */
  composition?: string;
}

/**
 * Calculates a dynamic time estimate based on generation settings.
 */
function getTimeEstimate(
  category?: ContentCategory,
  includeComposite?: boolean,
  resolution?: ImageResolution,
  composition?: string
): string {
  let minSeconds = 20;
  let maxSeconds = 40;

  // Category-specific base times
  if (category === "before-after") {
    minSeconds = 50;
    maxSeconds = 80;
    if (includeComposite) {
      minSeconds += 10;
      maxSeconds += 15;
    }
  } else if (category === "product") {
    // Product has reference images to process
    minSeconds = 40;
    maxSeconds = 75;
  } else if (category === "application-process") {
    minSeconds = 25;
    maxSeconds = 45;
  }

  // Group shots take longer
  if (composition === "group") {
    minSeconds += 10;
    maxSeconds += 15;
  }

  // Resolution multiplier
  if (resolution === "2K") {
    minSeconds = Math.round(minSeconds * 1.3);
    maxSeconds = Math.round(maxSeconds * 1.5);
  } else if (resolution === "4K") {
    minSeconds = Math.round(minSeconds * 2);
    maxSeconds = Math.round(maxSeconds * 2.5);
  }

  // Format nicely
  if (maxSeconds >= 60) {
    const minMin = Math.floor(minSeconds / 60);
    const maxMin = Math.ceil(maxSeconds / 60);
    if (minMin === 0) {
      return `Usually takes up to ${maxMin} min`;
    }
    if (minMin === maxMin) {
      return `Usually takes ~${minMin} min`;
    }
    return `Usually takes ${minMin}–${maxMin} min`;
  }
  return `Usually takes ${minSeconds}–${maxSeconds}s`;
}

export function GenerationProgress({
  isVisible,
  category,
  includeComposite,
  resolution,
  composition,
}: GenerationProgressProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setMessageIndex(0);
      setElapsed(0);
      return;
    }

    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % CYCLING_MESSAGES.length);
    }, 3000);

    const timerInterval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(msgInterval);
      clearInterval(timerInterval);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const timeEstimate = getTimeEstimate(category, includeComposite, resolution, composition);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-coco-brown/60 backdrop-blur-sm">
      <div className="mx-4 flex max-w-sm flex-col items-center gap-6 rounded-2xl bg-white p-8 shadow-2xl">
        {/* Animated eyes loader */}
        <div className="coco-eyes-loader" />

        {/* Cycling message */}
        <div className="text-center">
          <p className="text-lg font-semibold text-coco-brown transition-all duration-500">
            {CYCLING_MESSAGES[messageIndex]}
          </p>
          <p className="mt-2 text-sm text-coco-brown-medium">
            {timeEstimate}
          </p>
        </div>

        {/* Elapsed timer */}
        <div className="flex items-center gap-2 text-xs text-coco-brown-medium/60">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-coco-golden" />
          {elapsed}s elapsed
        </div>

        {/* Progress bar — striped animated */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-coco-beige-dark/30">
          <div
            className="coco-progress-bar h-full rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${Math.min(95, elapsed * 3)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
