/**
 * Composition Descriptors
 *
 * Defines how many people appear and their positioning.
 * M1: Solo and Duo. M2 adds Group (3+).
 */
import type { Composition } from "@/lib/types";

const COMPOSITION_DESCRIPTORS: Record<Composition, string> = {
  solo:
    "single woman, solo portrait composition, centered in frame with intentional negative space for branding",
  duo:
    "two women together, duo composition showing friendship and connection, slightly overlapping poses, both equally lit and styled, diverse skin tones and hair styles",
};

/**
 * Returns the prompt descriptor for a given composition.
 */
export function getCompositionDescriptor(composition: Composition): string {
  return COMPOSITION_DESCRIPTORS[composition];
}

/**
 * UI options for the composition selector.
 */
export const COMPOSITION_OPTIONS: { value: Composition; label: string; description: string }[] = [
  { value: "solo", label: "Solo", description: "Single person portrait" },
  { value: "duo", label: "Duo", description: "Two people together" },
];
