/**
 * Product Photography Category Template
 *
 * Generates premium product staging imagery.
 * Focuses on: product presentation, surface materials, props, lighting.
 * No people — just product and environment.
 */
import type { GenerationSelections, Scene } from "@/lib/types";
import { getSceneDescriptor } from "../modules/scenes";

export function buildProductPrompt(
  selections: GenerationSelections,
  resolvedScene: Exclude<Scene, "random">
): string {
  const sceneDesc = getSceneDescriptor(resolvedScene);

  const surfaceMaterials = [
    "on a polished rose-gold marble surface with soft reflections",
    "on a luxurious creamy beige velvet surface with subtle texture",
    "on a clean white marble surface with delicate gold veining",
    "on a warm wooden surface with a matte finish and natural grain",
  ];
  const surface = surfaceMaterials[Math.floor(Math.random() * surfaceMaterials.length)];

  const propSuggestions = [
    "styled with minimalist self-care props — a small rose quartz roller, dried pampas grass, and a silk eye mask in soft pink",
    "accompanied by elegant gold-accented accessories — a small mirror, delicate chain, and a fresh white rose",
    "surrounded by luxurious beauty essentials — a cotton pouch in beige, soft makeup brush, and a pearl earring",
    "arranged with botanical elements — eucalyptus sprigs, small amber glass bottle, and a warm-toned candle",
  ];
  const props = propSuggestions[Math.floor(Math.random() * propSuggestions.length)];

  const logoSpaceInstruction = selections.logoOverlay.enabled
    ? `\n\nLOGO SPACE: Leave intentional negative space in the ${selections.logoOverlay.position?.replace("-", " ") || "bottom right"} area of the image for logo overlay.`
    : "";

  return `CATEGORY: PRODUCT PHOTOGRAPHY — Premium commercial product staging.

SUBJECT: Luxury lash product packaging (a sleek, premium lash case/box) displayed ${surface}. ${props}.

SCENE: ${sceneDesc}. Clean, aspirational, luxury beauty brand aesthetic.

COMPOSITION: Center-weighted composition with the product as the hero element. Shallow depth of field with the product in razor-sharp focus and background props softly blurred.

LIGHTING: Soft "glow" lighting from above and slightly behind, creating a warm halo effect around the product. Warm color temperature (3500K-4000K). Subtle rim light on product edges. No harsh shadows — diffused and flattering.

COLOR PALETTE: Warm brand colors throughout — soft pinks (#ead1c1), creamy beiges (#ede5d6), golden browns (#ce9765). All props and styling elements complement the CocoLash brand palette.

QUALITY: 8K commercial product photography quality. Ultra-sharp product detail. Professional color grading. Clean, magazine-worthy composition.

STYLE: Aspirational luxury — the kind of product image that makes you want to own it. Think Glossier meets Tom Ford meets Black-owned luxury brand.${logoSpaceInstruction}${selections.contextNote ? `\n\nCONTEXT NOTE: ${selections.contextNote}` : ""}`;
}
