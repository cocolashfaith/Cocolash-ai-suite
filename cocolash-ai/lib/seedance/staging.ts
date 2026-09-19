/**
 * Campaign staging — the single source of truth for HOW a UGC clip is
 * physically shot (2026-09-18, Harry's third-arm report).
 *
 * The failure this kills: the vision Director's aesthetic rules forced
 * "handheld selfie" (one hand permanently on the phone) while the unboxing
 * campaign guidance ordered "opening motion" (a two-hand action). Nothing
 * counted hands, so Seedance invented an extra limb. Every campaign type now
 * carries an explicit camera RIG and a product STAGING, and the Director gets
 * hard hand-accounting rules derived from them.
 *
 * Used by: the compose route (pose of the composed avatar), the vision
 * Director (rig physics + hand accounting + product-state timeline), and the
 * wizard UI (the Staging control, auto-defaulted per campaign).
 */

/** How the phone is held — decides how many hands are free. */
export type StagingMode = "holding-selfie" | "desk-propped";

/** Where the product starts on camera for desk stagings. */
export type DeskProductState = "closed" | "open";

/** Pose of the COMPOSED avatar reference (must match the video's frame 1). */
export type ComposePose = "holding" | "desk-closed" | "desk-open";

export const STAGING_MODES: readonly StagingMode[] = [
  "holding-selfie",
  "desk-propped",
];

export const COMPOSE_POSES: readonly ComposePose[] = [
  "holding",
  "desk-closed",
  "desk-open",
];

/**
 * Default rig per campaign type. Two-hand campaigns (opening, demoing,
 * gesturing over an open kit) get the propped phone; talking-head campaigns
 * keep the handheld selfie.
 */
export function defaultStagingMode(campaignType: string): StagingMode {
  switch (campaignType) {
    case "unboxing":
    case "product-showcase":
    case "educational":
      return "desk-propped";
    default:
      // testimonial, promo, before-after, unknown → the classic selfie.
      return "holding-selfie";
  }
}

/**
 * For desk stagings: does the clip START with the box closed (an unboxing
 * opens it on camera) or already open (a showcase gestures over it)?
 */
export function deskProductState(campaignType: string): DeskProductState {
  return campaignType === "unboxing" ? "closed" : "open";
}

/** The composed-avatar pose implied by a staging choice. */
export function composePoseFor(
  mode: StagingMode,
  campaignType: string
): ComposePose {
  if (mode === "holding-selfie") return "holding";
  return deskProductState(campaignType) === "closed"
    ? "desk-closed"
    : "desk-open";
}

/** UI labels for the Staging control. */
export const STAGING_MODE_LABELS: Record<
  StagingMode,
  { label: string; hint: string }
> = {
  "holding-selfie": {
    label: "Holding — selfie",
    hint: "She holds the phone in one hand and the closed product in the other. Nothing gets opened on camera.",
  },
  "desk-propped": {
    label: "On a desk — propped phone",
    hint: "The phone is propped up, both her hands are free — she can open and demo the product naturally.",
  },
};

/**
 * Compose-time pose fragments (the sentence the image model gets). The
 * closed-box proportion rules live in the route's reference instruction and
 * apply to every pose.
 */
export function composePosePrompt(pose: ComposePose): string {
  switch (pose) {
    case "holding":
      return "The creator is naturally holding the CLOSED product from the reference images — at chest level, in one hand, the FRONT label facing the camera squarely, upright and fully readable, the closed box's true proportions kept exactly as photographed.";
    case "desk-closed":
      return "The creator sits at a desk or table; the CLOSED product from the reference images rests on the surface in front of her, FRONT label facing the camera squarely and upright, its true proportions kept exactly as photographed. BOTH of her hands are visible and empty — resting near the box as if she is about to open it. The framing looks like a phone propped up facing her.";
    case "desk-open":
      return "The creator sits at a desk or table; the product from the reference images is OPEN on the surface in front of her, arranged exactly as the open-box reference images show — same tray, same contents, same layout (if no reference shows it open, place it CLOSED on the desk instead). BOTH of her hands are visible and free, one gesturing toward the open kit. The framing looks like a phone propped up facing her.";
  }
}

/** Rig physics the video prompt must obey. */
const RIG_RULES: Record<StagingMode, string> = {
  "holding-selfie": `CAMERA RIG — HANDHELD SELFIE: she films herself with the phone in one hand at arm's length. That hand NEVER appears in frame and is NEVER free. Only ONE hand is available for any action. Natural handheld sway is welcome.`,
  "desk-propped": `CAMERA RIG — PROPPED PHONE: the phone is propped up on the desk/shelf facing her, so the framing is FIXED (no handheld sway, no walking the camera). BOTH of her hands are free and may appear in frame. She leans toward or away from the fixed camera instead of the camera moving.`,
};

/** The rule that kills the third arm. Injected for every staging. */
export const HAND_ACCOUNTING_RULE = `HAND ACCOUNTING — NON-NEGOTIABLE: count her free hands before staging ANY action. Never stage an action that needs more hands than the rig leaves free. Exactly one person is in frame; exactly two hands exist in the scene; a hand holding the phone can never simultaneously hold, open, or touch the product. If the script implies a two-hand action under a selfie rig, stage a one-hand version instead (tilt the box to camera, tap the lid) — never invent an extra hand or arm.`;

/**
 * Product-state timeline per campaign for desk stagings — what the box does
 * across the clip.
 */
function productTimeline(mode: StagingMode, campaignType: string): string {
  if (mode === "holding-selfie") {
    return "PRODUCT STATE: the product stays CLOSED in her non-phone hand for the whole clip. She shows faces of the box by tilting it, never by opening it.";
  }
  if (deskProductState(campaignType) === "closed") {
    return "PRODUCT STATE: the clip STARTS with the box CLOSED on the desk. She opens it on camera with both hands at a natural beat (not in the first second), then reacts to the contents. Describe the opened state ONLY from what the open-box reference images show; if the lid opens toward the camera, describe its visible back positively as plain unprinted board (the brand lettering lives on the box front/top, as the references show).";
  }
  return "PRODUCT STATE: the product is ALREADY OPEN on the desk for the whole clip — she gestures over the open tray and may lift ONE item at a time with one hand, returning it before the next. The box is never closed and re-opened. Stage the open state exactly as the open-box references show it; if NO reference shows the product open, keep it CLOSED on the desk and have her present it closed instead.";
}

/**
 * The full staging block for the vision Director's prompt. Always available —
 * when the UI sends no explicit staging, callers derive the default from the
 * campaign type so even non-composed runs get rig physics.
 */
export function stagingDirectorBlock(
  mode: StagingMode,
  campaignType: string
): string {
  return [
    RIG_RULES[mode],
    HAND_ACCOUNTING_RULE,
    productTimeline(mode, campaignType),
  ].join("\n");
}

/** The staging a compose pose implies (a desk image needs a propped rig). */
export function stagingModeForPose(pose: ComposePose): StagingMode {
  return pose === "holding" ? "holding-selfie" : "desk-propped";
}

/**
 * Resolve the ONE staging the whole prompt build uses (Codex F5): an explicit
 * request wins; a composed reference WITHOUT staging metadata is a legacy
 * holding shot (pre-staging clients always composed "holding"), so it must
 * not be re-interpreted by the campaign default; only a non-composed request
 * falls through to the campaign default.
 */
export function resolveStagingMode(input: {
  stagingMode?: StagingMode;
  influencerAlreadyHoldsProduct?: boolean;
  campaignType: string;
}): StagingMode {
  if (input.stagingMode) return input.stagingMode;
  if (input.influencerAlreadyHoldsProduct) return "holding-selfie";
  return defaultStagingMode(input.campaignType);
}

export function isStagingMode(value: unknown): value is StagingMode {
  return (
    typeof value === "string" &&
    (STAGING_MODES as readonly string[]).includes(value)
  );
}

export function isComposePose(value: unknown): value is ComposePose {
  return (
    typeof value === "string" &&
    (COMPOSE_POSES as readonly string[]).includes(value)
  );
}
