"use client";

import { useEffect, useState, useMemo } from "react";
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
 * Returns estimated min/max seconds and a formatted label string.
 */
function getTimeEstimate(
  category?: ContentCategory,
  includeComposite?: boolean,
  resolution?: ImageResolution,
  composition?: string
): { minSeconds: number; maxSeconds: number; label: string } {
  let minSeconds = 20;
  let maxSeconds = 40;

  if (category === "before-after") {
    minSeconds = 50;
    maxSeconds = 80;
    if (includeComposite) {
      minSeconds += 10;
      maxSeconds += 15;
    }
  } else if (category === "product") {
    minSeconds = 40;
    maxSeconds = 75;
  } else if (category === "application-process") {
    minSeconds = 25;
    maxSeconds = 45;
  }

  if (composition === "group") {
    minSeconds += 10;
    maxSeconds += 15;
  }

  if (resolution === "2K") {
    minSeconds = Math.round(minSeconds * 1.3);
    maxSeconds = Math.round(maxSeconds * 1.5);
  } else if (resolution === "4K") {
    minSeconds = Math.round(minSeconds * 2);
    maxSeconds = Math.round(maxSeconds * 2.5);
  }

  let label: string;
  if (maxSeconds >= 60) {
    const minMin = Math.floor(minSeconds / 60);
    const maxMin = Math.ceil(maxSeconds / 60);
    if (minMin === 0) {
      label = `Usually takes up to ${maxMin} min`;
    } else if (minMin === maxMin) {
      label = `Usually takes ~${minMin} min`;
    } else {
      label = `Usually takes ${minMin}–${maxMin} min`;
    }
  } else {
    label = `Usually takes ${minSeconds}–${maxSeconds}s`;
  }

  return { minSeconds, maxSeconds, label };
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

  // Compute estimate once when overlay appears (memoized on settings)
  const estimate = useMemo(
    () => getTimeEstimate(category, includeComposite, resolution, composition),
    [category, includeComposite, resolution, composition]
  );

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

  // Progress calculation based on estimated midpoint time.
  // Uses the average of min/max as the "expected" completion time.
  // Fills to ~90% at expected time, then slows down asymptotically toward 98%.
  const expectedTime = (estimate.minSeconds + estimate.maxSeconds) / 2;
  let progress: number;
  if (elapsed <= expectedTime) {
    // Linear ramp to 90% at expected time
    progress = (elapsed / expectedTime) * 90;
  } else {
    // Asymptotic slowdown: 90% → 98% over the remaining time
    const overtime = elapsed - expectedTime;
    const extraProgress = 8 * (1 - Math.exp(-overtime / (expectedTime * 0.5)));
    progress = 90 + extraProgress;
  }
  progress = Math.min(progress, 98);

  // Format remaining time estimate
  const remainingSeconds = Math.max(0, Math.round(expectedTime - elapsed));
  let remainingLabel: string;
  if (elapsed >= expectedTime) {
    remainingLabel = "Finishing up...";
  } else if (remainingSeconds >= 60) {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    remainingLabel = secs > 0 ? `~${mins}m ${secs}s remaining` : `~${mins}m remaining`;
  } else {
    remainingLabel = `~${remainingSeconds}s remaining`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-coco-brown/60 backdrop-blur-sm">
      {/* Fixed-width card — prevents layout shift from varying message lengths */}
      <div className="mx-4 flex w-[340px] flex-col items-center gap-5 rounded-2xl bg-white p-8 shadow-2xl">
        {/* Animated eyes loader */}
        <div className="coco-eyes-loader" />

        {/* Cycling message — fixed height to prevent layout shift */}
        <div className="flex h-[52px] w-full items-center justify-center text-center">
          <p className="text-lg font-semibold text-coco-brown transition-opacity duration-500">
            {CYCLING_MESSAGES[messageIndex]}
          </p>
        </div>

        {/* Time estimate label */}
        <p className="text-sm text-coco-brown-medium">
          {estimate.label}
        </p>

        {/* Progress bar — reflects real estimated progress */}
        <div className="w-full space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-coco-beige-dark/30">
            <div
              className="coco-progress-bar h-full rounded-full"
              style={{
                width: `${progress}%`,
                transition: "width 1s ease-out",
              }}
            />
          </div>

          {/* Elapsed + remaining */}
          <div className="flex items-center justify-between text-xs text-coco-brown-medium/60">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-coco-golden" />
              {elapsed}s elapsed
            </div>
            <span>{remainingLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
