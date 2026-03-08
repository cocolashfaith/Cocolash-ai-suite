/**
 * Age Range Descriptors — Upgrade 1, Phase 1.10
 *
 * Photography-grade descriptors for solo/duo age ranges.
 * These are separate from the group shot AgeRange ("same" | "mixed" | "mature")
 * which already exists in compositions.ts.
 */
import type { SoloDuoAgeRange } from "@/lib/types";

const AGE_RANGE_DESCRIPTORS: Record<Exclude<SoloDuoAgeRange, "random">, string[]> = {
  "20s": [
    "in her early to mid twenties, youthful and vibrant, fresh-faced energy",
    "young woman in her twenties with a youthful glow and bright, energetic presence",
  ],
  "30s": [
    "in her thirties, confident and radiant, self-assured with timeless beauty",
    "woman in her thirties radiating confidence, established and elegant",
  ],
  "40s": [
    "in her forties, elegant and assured, refined beauty with effortless grace",
    "sophisticated woman in her forties, poised and graceful with a warm, knowing expression",
  ],
  "50s-plus": [
    "in her fifties or older, graceful and distinguished, ageless beauty with wisdom",
    "mature woman over fifty, radiant and dignified, embodying timeless elegance",
  ],
};

export function getAgeRangeDescriptor(
  ageRange: Exclude<SoloDuoAgeRange, "random">
): string {
  const descriptors = AGE_RANGE_DESCRIPTORS[ageRange];
  return descriptors[Math.floor(Math.random() * descriptors.length)];
}

export const ALL_AGE_RANGES: Exclude<SoloDuoAgeRange, "random">[] = [
  "20s",
  "30s",
  "40s",
  "50s-plus",
];

export const SOLO_DUO_AGE_OPTIONS: {
  value: SoloDuoAgeRange;
  label: string;
}[] = [
  { value: "random", label: "Random" },
  { value: "20s", label: "20s" },
  { value: "30s", label: "30s" },
  { value: "40s", label: "40s" },
  { value: "50s-plus", label: "50s+" },
];
