/**
 * Lifestyle / Editorial Category Template
 *
 * Generates medium-shot portrait / lifestyle photography.
 * Persona-driven, considers scene, vibe, composition, and outfit.
 *
 * M2: Added group composition support with per-person diversity descriptions.
 */
import type {
  GenerationSelections,
  SkinTone,
  Composition,
  GroupDiversitySelections,
} from "@/lib/types";
import { getSkinToneDescriptor } from "../modules/skin-tones";
import { getLashStyleDescriptor } from "../modules/lash-styles";
import { getHairStyleDescriptor } from "../modules/hair-styles";
import { getSceneDescriptor } from "../modules/scenes";
import { getVibeDescriptor } from "../modules/vibes";
import {
  getCompositionDescriptor,
  getGroupCompositionPrompt,
} from "../modules/compositions";
import type { Scene, Vibe, HairStyle } from "@/lib/types";

export function buildLifestylePrompt(
  selections: GenerationSelections,
  resolvedSkinTone: Exclude<SkinTone, "random">,
  resolvedScene: Exclude<Scene, "random">,
  resolvedVibe: Exclude<Vibe, "random">,
  resolvedHairStyle: Exclude<HairStyle, "random">,
  groupDiversity?: GroupDiversitySelections | null
): string {
  const lashDesc = getLashStyleDescriptor(selections.lashStyle);
  const sceneDesc = getSceneDescriptor(resolvedScene);
  const vibeDesc = getVibeDescriptor(resolvedVibe);

  const personaDescriptions = [
    '"Balanced Beauty" persona — effortless, natural-enhanced glam that says "I woke up like this"',
    '"She\'s Got Style" persona — bold, fashion-forward, head-turning confidence',
  ];
  const persona = personaDescriptions[Math.floor(Math.random() * personaDescriptions.length)];

  const outfitSuggestions = [
    "wearing an elegant outfit in warm neutral tones complementing the CocoLash brand palette — soft pinks, creamy beiges, or warm browns",
    "styled in a chic, contemporary outfit with brand-complementary warm tones, accessorized with gold jewelry",
    "dressed in a sophisticated, on-trend outfit with warm earth tones and subtle golden accents",
  ];
  const outfit = outfitSuggestions[Math.floor(Math.random() * outfitSuggestions.length)];

  const negativeSpaceHint = selections.logoOverlay.enabled
    ? `\n\nCOMPOSITION NOTE: Keep the ${selections.logoOverlay.position?.replace("-", " ") || "bottom right"} corner relatively clear — avoid placing important subject elements there.`
    : "";

  // ── Group Composition ─────────────────────────────────────
  if (selections.composition === "group" && groupDiversity) {
    const groupPrompt = getGroupCompositionPrompt(groupDiversity);

    return `CATEGORY: LIFESTYLE / EDITORIAL — Group portrait photography.

${groupPrompt}

LASHES: Every woman is wearing stunning ${lashDesc}. Lashes should be clearly visible on each woman — a standout feature for all.

EXPRESSION & VIBE: ${vibeDesc}. "Black Girl Magic" energy — authentic sisterhood, joy, and confidence. ${persona}.

SCENE: ${sceneDesc}.

OUTFIT: Each woman ${outfit}, each with her own personal style twist while maintaining visual cohesion as a group.

FRAMING: Wide to medium group shot. All ${groupDiversity.groupCount} women clearly visible. Rule of thirds composition. Sharp focus on all subjects.

STYLING: CocoLash brand colors present in the scene — warm pinks, beiges, browns, and golden accents woven naturally into wardrobe, props, or environment.

LIGHTING: Warm diffused lighting (3500K-4200K), soft and flattering. Even illumination on ALL faces — no one in shadow.${negativeSpaceHint}${selections.contextNote ? `\n\nCONTEXT NOTE: ${selections.contextNote}` : ""}`;
  }

  // ── Solo / Duo Composition ────────────────────────────────
  const skinDesc = getSkinToneDescriptor(resolvedSkinTone);
  const hairDesc = getHairStyleDescriptor(resolvedHairStyle);
  const compDesc = getCompositionDescriptor(selections.composition as Composition);

  return `CATEGORY: LIFESTYLE / EDITORIAL — Medium-shot portrait photography.

COMPOSITION: ${compDesc}.

SUBJECT: Beautiful African American woman, ${skinDesc}. ${hairDesc}. ${outfit}. ${persona}.

LASHES: Wearing stunning ${lashDesc}. Lashes should be clearly visible and a standout feature even in the wider shot.

EXPRESSION & VIBE: ${vibeDesc}. "She's Black & Proud" energy — authentic confidence without aggression.

SCENE: ${sceneDesc}.

FRAMING: Medium shot from waist up. Rule of thirds composition. Sharp focus on the subject with environmental bokeh.

STYLING: CocoLash brand colors present in the scene — warm pinks, beiges, browns, and golden accents woven naturally into wardrobe, props, or environment.

LIGHTING: Warm diffused lighting (3500K-4200K), soft and flattering. Natural-looking with gentle directional light creating depth.${negativeSpaceHint}${selections.contextNote ? `\n\nCONTEXT NOTE: ${selections.contextNote}` : ""}`;
}
