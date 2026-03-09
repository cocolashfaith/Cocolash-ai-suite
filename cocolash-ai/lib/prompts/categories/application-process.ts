/**
 * Application Process Category Template (M2)
 *
 * Generates a single prompt for one of FIVE application steps:
 *   1. Preparation — gel pads, tool prep, consultation
 *   2. Isolation — single lash isolation with tweezers
 *   3. Application — bonding moment, adhesive + lash placement
 *   4. Final Check — mirror reveal, finishing touches
 *   5. Reveal — completed look, client reaction
 *
 * Each step has tutorial-quality detail for educational/social content.
 * All images should feel like they come from the same session.
 */
import type { ApplicationStep, GenerationSelections, SkinTone, HairStyle, Ethnicity } from "@/lib/types";
import { getSkinToneDescriptor } from "../modules/skin-tones";
import { getLashStyleDescriptor } from "../modules/lash-styles";
import { getHairStyleDescriptor } from "../modules/hair-styles";

/** Metadata and prompt content for each application step */
interface StepDefinition {
  stepNumber: number;
  title: string;
  description: string;
  prompt: string;
}

const STEP_DEFINITIONS: Record<ApplicationStep, StepDefinition> = {
  preparation: {
    stepNumber: 1,
    title: "Preparation",
    description: "Gel pads, tool prep, client consultation",
    prompt: `STEP 1 — PREPARATION & CONSULTATION

SCENE DESCRIPTION:
Clean, professional lash salon workstation. The lash technician (an elegant woman
in a branded CocoLash polo/apron) is preparing her workspace for the client.

KEY ELEMENTS TO SHOW:
- Under-eye gel pads being carefully placed on the client's lower lash line
- Professional lash extension tools laid out neatly: curved tweezers, isolation tweezers,
  lash adhesive, jade stone, lash tile with pre-selected extension fibers
- Client reclined comfortably on a lash bed with clean white/cream linens
- Technician wearing clean nitrile gloves
- Warm, inviting salon atmosphere with soft ambient lighting
- Ring light or adjustable task light in background

MOOD: Professional, welcoming, hygienic, premium. The viewer should feel this is a high-end
salon experience they can trust.`,
  },

  isolation: {
    stepNumber: 2,
    title: "Isolation",
    description: "Single lash isolation with precision tweezers",
    prompt: `STEP 2 — ISOLATION

SCENE DESCRIPTION:
Extreme close-up of the lash application in progress. The technician is isolating a single
natural lash using fine-point isolation tweezers.

KEY ELEMENTS TO SHOW:
- One natural lash perfectly isolated from its neighbors using fine tweezers
- Technician's gloved hand steady and precise, holding isolation tweezers
- Client's eye closed peacefully
- Individual natural lashes visible at high detail
- Under-eye gel pad protecting the lower lashes
- Professional ring light reflection visible in a subtle way

CAMERA: Extreme macro, as close as possible while showing the full eye area.
Shallow depth of field — the isolated lash is sharp, surrounding area has gentle bokeh.

MOOD: Precision, expertise, meticulous care. This shot demonstrates the skill and patience
required for professional lash application.`,
  },

  application: {
    stepNumber: 3,
    title: "Application",
    description: "Bonding moment — adhesive and lash placement",
    prompt: `STEP 3 — APPLICATION (THE BONDING MOMENT)

SCENE DESCRIPTION:
The critical moment of placing a lash extension onto an isolated natural lash.
The technician uses curved application tweezers to bond the extension.

KEY ELEMENTS TO SHOW:
- A single lash extension being precisely placed onto an isolated natural lash
- Curved application tweezers holding the extension fiber
- A tiny droplet of adhesive visible at the base of the extension
- Other already-applied extensions visible — showing progress
- The contrast between the treated area (full, beautiful lashes) and the untreated area
  (natural sparse lashes)
- Client's eye closed, relaxed expression

CAMERA: Extreme macro shot, even tighter than Step 2. The bonding point is the focal point.
Think 1:1 macro photography quality.

MOOD: Mastery, transformation-in-progress, satisfying craftsmanship. This is the "hero"
technical shot that showcases professional expertise.`,
  },

  "final-check": {
    stepNumber: 4,
    title: "Final Check",
    description: "Mirror reveal and finishing touches",
    prompt: `STEP 4 — FINAL CHECK & MIRROR REVEAL

SCENE DESCRIPTION:
The application is complete. The technician holds a handheld mirror for the client,
who is sitting up slightly to see her new lashes for the first time.

KEY ELEMENTS TO SHOW:
- Client looking into a handheld mirror with a delighted, surprised expression
- Both eyes now featuring full, beautiful lash extensions
- Technician standing behind/beside the client, smiling proudly
- The reflection in the mirror showing the stunning lash result
- Under-eye gel pads have been removed — clean, finished look
- Lash aftercare products visible on the counter (lash cleanser, spoolie brush)

CAMERA: Medium shot capturing both the client's face and the mirror interaction.
Warm, soft lighting that highlights the lash detail.

MOOD: Excitement, reveal moment, pride, beauty transformation. The viewer should
feel the emotional payoff of the entire process.`,
  },

  reveal: {
    stepNumber: 5,
    title: "Reveal",
    description: "Completed look and client reaction",
    prompt: `STEP 5 — THE REVEAL (COMPLETED TRANSFORMATION)

SCENE DESCRIPTION:
The final glamour shot. The client is now standing/sitting confidently, fully composed,
showing off her stunning new CocoLash extensions. This is the money shot.

KEY ELEMENTS TO SHOW:
- Client facing the camera with a confident, radiant smile
- Stunning CocoLash extensions are the clear HERO — perfectly curled, full, dramatic
- The lashes frame her eyes beautifully, catching the light
- Full face visible, flawless makeup complementing the lashes
- Either looking directly at camera OR a candid moment of touching/admiring the lashes
- Clean, bright setting — could be the salon's photo area or an aesthetic backdrop

CAMERA: Portrait-style, 85mm equivalent. Shallow depth of field with the face and
lashes in razor-sharp focus. Warm, golden-hour style lighting.

MOOD: Empowerment, confidence, "I feel beautiful," Black Girl Magic energy.
This image should make viewers want to book an appointment immediately.`,
  },
};

/**
 * Builds a prompt for a specific application process step.
 */
export function buildApplicationProcessPrompt(
  selections: GenerationSelections,
  resolvedSkinTone: Exclude<SkinTone, "random">,
  resolvedHairStyle: Exclude<HairStyle, "random">,
  step: ApplicationStep,
  resolvedEthnicity?: Exclude<Ethnicity, "random">,
  ethnicityDesc?: string,
  ageRangeDesc?: string
): string {
  const stepDef = STEP_DEFINITIONS[step];
  const skinDesc = getSkinToneDescriptor(resolvedSkinTone);
  const hairDesc = getHairStyleDescriptor(resolvedHairStyle);
  const lashDesc = getLashStyleDescriptor(selections.lashStyle);

  const isAfricanAmerican = !resolvedEthnicity || resolvedEthnicity === "african-american";
  const subjectDesc = ethnicityDesc
    ? ethnicityDesc
    : "Beautiful African American woman";
  const skinClause = isAfricanAmerican ? ` ${skinDesc}.` : "";
  const ageClause = ageRangeDesc ? ` ${ageRangeDesc}.` : "";

  return `CATEGORY: LASH APPLICATION PROCESS — STEP ${stepDef.stepNumber} OF 5: "${stepDef.title.toUpperCase()}"

[TUTORIAL / EDUCATIONAL CONTENT — Behind-the-scenes of a professional lash extension appointment]

SUBJECT(S): ${subjectDesc}.${skinClause}${ageClause} ${hairDesc}.
Target lash style for the completed look: ${lashDesc} extensions.

${stepDef.prompt}

STYLING & BRANDING NOTES:
- All salon elements should feel premium, modern, and CocoLash-branded
- Color palette: warm neutrals, cream, rose gold, soft pink — aligned with CocoLash brand
- Clean, hygienic environment — this is educational content that builds trust
- Every shot should feel like it belongs to the same session/series${selections.contextNote ? `\n\nCONTEXT NOTE: ${selections.contextNote}` : ""}`;
}

/** Get step metadata (for UI display) */
export function getApplicationSteps(): Array<{
  value: ApplicationStep;
  stepNumber: number;
  title: string;
  description: string;
}> {
  return (Object.entries(STEP_DEFINITIONS) as [ApplicationStep, StepDefinition][]).map(
    ([value, def]) => ({
      value,
      stepNumber: def.stepNumber,
      title: def.title,
      description: def.description,
    })
  );
}
