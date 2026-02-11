/**
 * Lash Style Descriptors
 *
 * 8 distinct lash styles with rich photography-grade descriptions.
 * Each describes the exact lash look Gemini should generate.
 */
import type { LashStyle } from "@/lib/types";

const LASH_STYLE_DESCRIPTORS: Record<LashStyle, string> = {
  natural:
    "natural-looking lash extensions with subtle length and feathery volume, enhancing the natural lash line with individual fibers visible, understated elegance",
  volume:
    "full volume lash extensions with lush, dense fans creating a dramatic yet soft-focus effect, each lash fiber individually distinguishable, luxurious fullness",
  dramatic:
    "dramatic statement lash extensions with extreme length and density, bold and striking with perfect curl and separation, show-stopping glamour",
  "cat-eye":
    "cat-eye lash extensions with graduated length increasing toward the outer corners, creating a sultry, elongated eye shape, flirty and sophisticated",
  wispy:
    "wispy lash extensions with varied lengths creating a textured, fluttery effect, alternating between short and long fibers for a natural-glam hybrid look",
  "doll-eye":
    "doll-eye lash extensions with maximum length and curl at the center of the eye, creating a wide-eyed, bright, youthful effect, perfectly symmetrical",
  hybrid:
    "hybrid lash extensions combining classic individual lashes with volume fans, the perfect balance of natural definition and glamorous fullness",
  "mega-volume":
    "mega-volume lash extensions with ultra-dense, fluffy fans creating the most dramatic and full effect, maximum impact with feathery-soft texture",
};

/**
 * Returns the prompt descriptor for a given lash style.
 */
export function getLashStyleDescriptor(lashStyle: LashStyle): string {
  return LASH_STYLE_DESCRIPTORS[lashStyle];
}

/**
 * UI options for the lash style selector.
 */
export const LASH_STYLE_OPTIONS: { value: LashStyle; label: string; description: string }[] = [
  { value: "natural", label: "Natural", description: "Subtle, feathery enhancement" },
  { value: "volume", label: "Volume", description: "Full, lush, dense fans" },
  { value: "dramatic", label: "Dramatic", description: "Bold, extreme length & density" },
  { value: "cat-eye", label: "Cat Eye", description: "Outer corner elongation" },
  { value: "wispy", label: "Wispy", description: "Textured, fluttery varied lengths" },
  { value: "doll-eye", label: "Doll Eye", description: "Wide-eyed, center-focused curl" },
  { value: "hybrid", label: "Hybrid", description: "Classic + volume blend" },
  { value: "mega-volume", label: "Mega Volume", description: "Ultra-dense, maximum impact" },
];
