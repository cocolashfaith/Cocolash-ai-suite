/**
 * Composition Descriptors
 *
 * Defines how many people appear and their positioning.
 * M1: Solo and Duo. M2 adds Group (3+).
 */
import type {
  Composition,
  GroupDiversitySelections,
  GroupAction,
  AgeRange,
  SkinTone,
  HairStyle,
} from "@/lib/types";
import { getSkinToneDescriptor } from "./skin-tones";
import { getHairStyleDescriptor } from "./hair-styles";
import { SKIN_TONE_TIERS } from "./skin-tones";
import { ALL_HAIR_STYLES } from "./hair-styles";

// ── Base Composition Descriptors ──────────────────────────────

const COMPOSITION_DESCRIPTORS: Record<Exclude<Composition, "group">, string> = {
  solo:
    "single woman, solo portrait composition, centered in frame with intentional negative space for branding",
  duo:
    "two women together, duo composition showing friendship and connection, slightly overlapping poses, both equally lit and styled, diverse skin tones and hair styles",
};

/**
 * Returns the prompt descriptor for solo/duo compositions.
 */
export function getCompositionDescriptor(composition: Composition): string {
  if (composition === "group") {
    return "group of African American women together, group portrait composition, all equally visible and well-lit";
  }
  return COMPOSITION_DESCRIPTORS[composition];
}

// ── Group Action Descriptors ──────────────────────────────────

const GROUP_ACTION_DESCRIPTORS: Record<GroupAction, string> = {
  laughing:
    "all laughing together genuinely, candid joyful moment, natural smiles and connection, sharing a funny moment",
  walking:
    "walking together confidently, urban or scenic backdrop, staggered positioning with natural stride, squad goals energy",
  posing:
    "striking a coordinated group pose, editorial-style formation, fashion-forward stances, each woman showcasing her unique style",
  brunch:
    "seated together at a stylish brunch table, cocktails and food visible, animated conversation, celebrating sisterhood over a meal",
  "getting-ready":
    "getting ready together in front of mirrors, doing each other's makeup, fixing lashes, salon or vanity setting, pre-event excitement",
};

// ── Age Range Descriptors ────────────────────────────────────

const AGE_RANGE_DESCRIPTORS: Record<AgeRange, string> = {
  same: "all appear to be a similar age in their mid-20s to early 30s",
  mixed: "a mix of ages from early 20s to 40s, representing generational beauty",
  mature: "all appear to be graceful women in their 40s-50s, showcasing mature elegance and timeless beauty",
};

// ── Group Composition Prompt Builder ─────────────────────────

/**
 * Builds a detailed group composition prompt describing each person
 * in the group with their individual skin tone and hair style.
 *
 * When mode === "diverse-mix", it auto-assigns skin tones and hair
 * styles to maximise visual diversity using a round-robin approach.
 *
 * @param diversity - The full group diversity configuration
 * @returns A detailed prompt block describing the group composition
 */
export function getGroupCompositionPrompt(
  diversity: GroupDiversitySelections
): string {
  const { groupCount, mode, people, ageRange, groupAction } = diversity;

  // Build per-person descriptions
  const personDescriptions: string[] = [];

  if (mode === "custom" && people.length >= groupCount) {
    // Custom: user specified each person
    for (let i = 0; i < groupCount; i++) {
      const person = people[i];
      const skinTone = person.skinTone === "random"
        ? SKIN_TONE_TIERS[i % SKIN_TONE_TIERS.length]
        : person.skinTone;
      const hairStyle = person.hairStyle === "random"
        ? ALL_HAIR_STYLES[i % ALL_HAIR_STYLES.length]
        : person.hairStyle;

      const skinDesc = getSkinToneDescriptor(skinTone);
      const hairDesc = getHairStyleDescriptor(hairStyle);
      personDescriptions.push(
        `Person ${i + 1}: ${skinDesc}, ${hairDesc}`
      );
    }
  } else {
    // Diverse Mix: auto-assign for maximum diversity
    const shuffledSkinTones = shuffleForDiversity(SKIN_TONE_TIERS, groupCount);
    const shuffledHairStyles = shuffleForDiversity(ALL_HAIR_STYLES, groupCount);

    for (let i = 0; i < groupCount; i++) {
      const skinDesc = getSkinToneDescriptor(shuffledSkinTones[i]);
      const hairDesc = getHairStyleDescriptor(shuffledHairStyles[i]);
      personDescriptions.push(
        `Person ${i + 1}: ${skinDesc}, ${hairDesc}`
      );
    }
  }

  const actionDesc = GROUP_ACTION_DESCRIPTORS[groupAction];
  const ageDesc = AGE_RANGE_DESCRIPTORS[ageRange];

  return `GROUP COMPOSITION: ${groupCount} beautiful African American women together in a single image.

INDIVIDUAL DESCRIPTIONS:
${personDescriptions.join("\n")}

GROUP DYNAMICS: ${actionDesc}. The women ${ageDesc}.

POSITIONING: All ${groupCount} women clearly visible and equally prominent. No one hidden behind another. Each woman is distinctly identifiable with her own unique look. Natural, comfortable body language showing genuine connection.

DIVERSITY: Each woman has a distinctly different skin tone, hair style, and personal style — celebrating the full spectrum of African American beauty. All women are wearing CocoLash premium lash extensions that are clearly visible.

LIGHTING: Even, flattering lighting on ALL ${groupCount} subjects. No harsh shadows obscuring any face. Warm, diffused (3500K-4200K).`;
}

// ── Helper: Shuffle array for diversity ──────────────────────

function shuffleForDiversity<T>(
  arr: readonly T[],
  count: number
): T[] {
  // Spread across array evenly, then fill with random picks
  const result: T[] = [];
  const step = arr.length / count;

  for (let i = 0; i < count; i++) {
    const index = Math.floor(i * step) % arr.length;
    result.push(arr[index]);
  }

  // Shuffle the result so it's not always in the same order
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// ── UI Options ───────────────────────────────────────────────

/**
 * UI options for the composition selector.
 */
export const COMPOSITION_OPTIONS: { value: Composition; label: string; description: string }[] = [
  { value: "solo", label: "Solo", description: "Single person portrait" },
  { value: "duo", label: "Duo", description: "Two people together" },
  { value: "group", label: "Group", description: "3-5 people together" },
];

/**
 * UI options for group action selector.
 */
export const GROUP_ACTION_OPTIONS: { value: GroupAction; label: string }[] = [
  { value: "laughing", label: "Laughing Together" },
  { value: "walking", label: "Walking Together" },
  { value: "posing", label: "Posing / Editorial" },
  { value: "brunch", label: "Brunch / Dining" },
  { value: "getting-ready", label: "Getting Ready" },
];

/**
 * UI options for age range selector.
 */
export const AGE_RANGE_OPTIONS: { value: AgeRange; label: string }[] = [
  { value: "same", label: "Same Age (20s-30s)" },
  { value: "mixed", label: "Mixed Ages (20s-40s)" },
  { value: "mature", label: "Mature (40s-50s)" },
];
