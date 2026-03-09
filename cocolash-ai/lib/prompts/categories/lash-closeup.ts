/**
 * Lash Close-Up Category Template
 *
 * Generates extreme macro eye/lash photography.
 * Focuses on: lash detail, skin texture, lighting, eye gaze.
 * Always uses studio-type settings.
 */
import type { GenerationSelections, Ethnicity } from "@/lib/types";
import { getSkinToneDescriptor } from "../modules/skin-tones";
import { getLashStyleDescriptor } from "../modules/lash-styles";
import type { SkinTone } from "@/lib/types";

export function buildLashCloseupPrompt(
  selections: GenerationSelections,
  resolvedSkinTone: Exclude<SkinTone, "random">,
  resolvedEthnicity?: Exclude<Ethnicity, "random">,
  ethnicityDesc?: string,
  ageRangeDesc?: string
): string {
  const skinDesc = getSkinToneDescriptor(resolvedSkinTone);
  const lashDesc = getLashStyleDescriptor(selections.lashStyle);

  const gazeDirections = [
    "looking directly into the camera with confident, inviting eyes",
    "with a soft, slightly downward gaze showing off the full lash line",
    "gazing upward to reveal the full length and curl of the lashes",
    "with eyes partially closed in a serene, elegant expression",
  ];
  const gaze = gazeDirections[Math.floor(Math.random() * gazeDirections.length)];

  const isAfricanAmerican = !resolvedEthnicity || resolvedEthnicity === "african-american";
  const subjectDesc = ethnicityDesc
    ? ethnicityDesc
    : `beautiful African American woman`;
  const skinClause = isAfricanAmerican ? ` ${skinDesc}.` : "";
  const ageClause = ageRangeDesc ? ` ${ageRangeDesc}.` : "";

  return `CATEGORY: LASH CLOSE-UP — Extreme macro beauty photography.

SUBJECT: Extreme close-up of a ${subjectDesc}'s eye and surrounding area.${skinClause}${ageClause} ${gaze}.

LASHES: ${lashDesc}. Every individual lash fiber must be distinctly visible and sharp. Lashes are the hero element of this image.

FRAMING: Tight crop from mid-brow to upper cheekbone. Eye fills 60-70% of the frame. Ultra-sharp focus on the lash line with creamy bokeh falloff on the background.

LIGHTING: Butterfly lighting with a prominent catchlight in the eye. Warm 3800K color temperature. Soft rim light on the brow bone. No harsh shadows.

BACKGROUND: Soft pink gradient background (#ead1c1 to #ede5d6), clean and minimal. Studio setting.

DETAILS: Perfect eyebrow grooming matching the lash style. Subtle shimmer on the eyelid. Hyper-realistic skin texture with visible pores and natural micro-textures. No retouching, no plastic look.${selections.contextNote ? `\n\nCONTEXT NOTE: ${selections.contextNote}` : ""}`;
}
