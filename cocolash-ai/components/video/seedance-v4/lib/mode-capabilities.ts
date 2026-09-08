import type { SeedanceEngine } from "@/lib/types";
import type { SeedanceV4Mode } from "../types";

export interface ModeCapability {
  /** What you have to give it. */
  inputs: string;
  /** What it is good at. */
  bestFor: string;
  /** What it will not do, plus the hard API limits. */
  limits: string;
}

/**
 * Plain-English capability copy for the nine Seedance 2.5 modes, shown in the
 * wizard's mode picker. Numbers come from docs/seedance-2.5/01-API-REFERENCE.md
 * ("Modes × media fields" + "Limits"):
 *   images ≤ 30 · videos ≤ 10 (under 30 s combined) · audios ≤ 10
 *   lip-sync / voice-clone audio ≤ 30 s · ugc products + influencers ≤ 30
 *   duration 4–30 s, or Auto (edit is always Auto)
 * Six of these modes also exist on Seedance 2.0, where the clip caps at 15 s;
 * edit, extend and voice_clone are 2.5 only.
 */
export const MODE_CAPABILITIES: Record<
  SeedanceV4Mode | "text_to_video",
  ModeCapability
> = {
  ugc: {
    inputs:
      "Product photos and influencer photos (up to 30 of them combined). No video or audio uploads.",
    bestFor:
      "Creator-style clips where a person holds, wears or shows the product and speaks to camera.",
    limits:
      "Products and influencers together must stay at or under 30 images. Videos and audio are ignored in this mode. One continuous shot — for a cut-to-cut sequence use Multi-Frame.",
  },
  text_to_video: {
    inputs: "A written description only. No images, video or audio.",
    bestFor:
      "Exploring an idea before you have any footage or product photos to work from.",
    limits:
      "Nothing is anchored to a reference, so the person and the product change from run to run. Highest variance of all the modes — expect to iterate.",
  },
  multi_reference: {
    inputs:
      "Any mix of images (up to 30), videos (up to 10) and audio clips (up to 10). At least one of the three is required.",
    bestFor:
      "Combining several sources — this face, that packaging, this room, that camera movement — into one shot.",
    limits:
      "Videos must total under 30 seconds, audio under 30 seconds. Give each reference one job in the prompt (@image1, @video1, @audio1) or the model blends them into mush.",
  },
  first_n_last_frames: {
    inputs:
      "A starting frame, and optionally an ending frame (we can generate the ending one for you).",
    bestFor:
      "A clean A-to-B transition where both the opening and the closing image matter.",
    limits:
      "The aspect ratio always follows the starting frame — you cannot set it here. The prompt describes the journey between the two frames, not the frames themselves.",
  },
  // NOTE: this is the SEEDANCE 2.0 wording — 2.0 silently drops images[] /
  // videos[] / audios[] for multi_frame, so the flow really is text-only there.
  // Engine 2.5 accepts (and sends) optional references — see MODE_CAPABILITIES_25.
  multi_frame: {
    inputs:
      "A script and a written description of the subject. Text only — no images are sent.",
    bestFor:
      "Short multi-shot sequences (wide → close-up → reaction) that share one subject and product.",
    limits:
      "Up to 10 segments, each 3–8 seconds, adding up to 4–30 seconds. Because no reference image is sent, the person and product are described in words in every segment — expect some drift between shots.",
  },
  edit: {
    inputs:
      "One or more source videos (required, up to 10) plus a written instruction of what to change. Images and audio optional.",
    bestFor:
      "Changing one thing inside a clip you already have — the background, the lighting, the wardrobe — while everything else stays put.",
    limits:
      "Seedance 2.5 only. Duration is always Auto (the output matches the source) and the aspect ratio follows the source video. Source videos must total under 30 seconds. Output is a .mov by default. It changes a clip; it cannot add new shots.",
  },
  extend: {
    inputs:
      "One or more source videos (required, up to 10) plus a note on how it should continue. Images and audio optional.",
    bestFor:
      "Carrying a clip on past its last frame — finishing a gesture, holding a beat, landing the smile.",
    limits:
      "Seedance 2.5 only. The aspect ratio follows the source video. Source videos must total under 30 seconds. Output is a .mov by default. It continues the same shot — it will not cut to a new one.",
  },
  lipsyncing: {
    inputs: "One or more person images (required, up to 30) and one audio file.",
    bestFor:
      "Talking-head clips where an existing recording drives the mouth movement.",
    limits:
      "The audio must be 30 seconds or shorter, and the clip runs as long as the audio. No video input. Keep the mouth visible and the body still — busy motion breaks the sync.",
  },
  voice_clone: {
    inputs:
      "One or more person images (required, up to 30) and one audio file to clone the voice from.",
    bestFor:
      "Talking-head clips that must sound like a specific real voice, not a generic one.",
    limits:
      "Seedance 2.5 only. The audio must be 30 seconds or shorter, and the clip runs as long as the audio. No video input. Do not describe the voice in the prompt — it comes from the audio. Keep the mouth visible.",
  },
};

/**
 * Engine 2.5 copy overrides. Only the modes whose behaviour actually differs
 * from 2.0 appear here.
 *
 * `multi_frame` is the one that matters: on 2.5 the Step-2 form offers
 * "Reference images (optional) 0/30" and those references ARE sent, so the 2.0
 * "text only — no images are sent" wording contradicted the form in front of
 * the user.
 */
export const MODE_CAPABILITIES_25: Partial<
  Record<SeedanceV4Mode | "text_to_video", ModeCapability>
> = {
  multi_frame: {
    inputs:
      "A script and a written description of the subject. Reference images, videos and audio are optional — anything you add is sent with the request.",
    bestFor:
      "Short multi-shot sequences (wide → close-up → reaction) that share one subject and product.",
    limits:
      "Up to 10 segments, each 3–8 seconds, adding up to 4–30 seconds. With no references attached the person and product are described in words in every segment — expect some drift between shots; add reference images to anchor them.",
  },
};

/** The capability copy to show for `mode` on `engine` (2.5 overrides win). */
export function capabilityFor(
  mode: SeedanceV4Mode | "text_to_video",
  engine?: SeedanceEngine
): ModeCapability | undefined {
  if (engine === "2.5") return MODE_CAPABILITIES_25[mode] ?? MODE_CAPABILITIES[mode];
  return MODE_CAPABILITIES[mode];
}
