/**
 * Campaign staging (2026-09-18, Harry's third-arm report). The pipeline
 * forced "handheld selfie" while unboxing guidance ordered a two-hand
 * opening; Seedance resolved the contradiction with an extra limb. Staging
 * is the single source of truth for rig + product state + compose pose.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HAND_ACCOUNTING_RULE,
  composePoseFor,
  composePosePrompt,
  defaultStagingMode,
  deskProductState,
  isComposePose,
  isStagingMode,
  resolveStagingMode,
  stagingDirectorBlock,
  stagingModeForPose,
} from "@/lib/seedance/staging";

const ROOT = resolve(__dirname, "../..");
const directorSource = readFileSync(
  resolve(ROOT, "lib/ai/director/seedance-vision-director.ts"),
  "utf8"
);
const routeSource = readFileSync(
  resolve(ROOT, "app/api/seedance/generate-ugc-image/route.ts"),
  "utf8"
);
const ugcModeSource = readFileSync(
  resolve(ROOT, "components/video/seedance-v4/modes/UgcMode.tsx"),
  "utf8"
);
const systemPromptsSource = readFileSync(
  resolve(ROOT, "lib/ai/director/system-prompts.ts"),
  "utf8"
);

describe("defaults per campaign (the approved matrix)", () => {
  it("two-hand campaigns get the propped phone", () => {
    expect(defaultStagingMode("unboxing")).toBe("desk-propped");
    expect(defaultStagingMode("product-showcase")).toBe("desk-propped");
    expect(defaultStagingMode("educational")).toBe("desk-propped");
  });

  it("talking-head campaigns keep the handheld selfie", () => {
    expect(defaultStagingMode("testimonial")).toBe("holding-selfie");
    expect(defaultStagingMode("promo")).toBe("holding-selfie");
    expect(defaultStagingMode("before-after")).toBe("holding-selfie");
    expect(defaultStagingMode("anything-unknown")).toBe("holding-selfie");
  });

  it("only an unboxing STARTS with the box closed on the desk", () => {
    expect(deskProductState("unboxing")).toBe("closed");
    expect(deskProductState("product-showcase")).toBe("open");
    expect(deskProductState("educational")).toBe("open");
  });

  it("compose pose follows rig + campaign", () => {
    expect(composePoseFor("holding-selfie", "unboxing")).toBe("holding");
    expect(composePoseFor("desk-propped", "unboxing")).toBe("desk-closed");
    expect(composePoseFor("desk-propped", "product-showcase")).toBe("desk-open");
  });
});

describe("the rules that kill the third arm", () => {
  it("hand accounting is explicit and non-negotiable", () => {
    expect(HAND_ACCOUNTING_RULE).toContain("count her free hands");
    expect(HAND_ACCOUNTING_RULE).toContain("never invent an extra hand or arm");
  });

  it("selfie rig declares exactly one free hand", () => {
    const block = stagingDirectorBlock("holding-selfie", "testimonial");
    expect(block).toContain("Only ONE hand is available");
    expect(block).toContain("stays CLOSED");
  });

  it("propped rig frees both hands and fixes the frame", () => {
    const block = stagingDirectorBlock("desk-propped", "unboxing");
    expect(block).toContain("BOTH of her hands are free");
    expect(block).toContain("FIXED");
    expect(block).toContain("opens it on camera with both hands");
  });

  it("unboxing block kills the mirrored-lid artifact — positively (Codex F6)", () => {
    const block = stagingDirectorBlock("desk-propped", "unboxing");
    expect(block).toContain("plain unprinted board");
    expect(block).not.toContain("never show lettering");
  });

  it("open-desk staging forbids re-closing and two-hand item juggling", () => {
    const block = stagingDirectorBlock("desk-propped", "product-showcase");
    expect(block).toContain("ALREADY OPEN");
    expect(block).toContain("ONE item at a time");
    // Codex F6: no open reference -> present it closed instead.
    expect(block).toContain("keep it CLOSED on the desk");
  });
});

describe("compose pose prompts", () => {
  it("desk poses show BOTH hands and a propped framing", () => {
    for (const pose of ["desk-closed", "desk-open"] as const) {
      const p = composePosePrompt(pose);
      expect(p).toContain("BOTH of her hands");
      expect(p).toContain("propped up");
    }
  });

  it("holding pose keeps the one-hand chest-level shot", () => {
    expect(composePosePrompt("holding")).toContain("in one hand");
  });

  it("type guards accept only real values", () => {
    expect(isStagingMode("desk-propped")).toBe(true);
    expect(isStagingMode("tripod")).toBe(false);
    expect(isComposePose("desk-open")).toBe(true);
    expect(isComposePose("floating")).toBe(false);
  });
});

describe("wiring", () => {
  it("the vision Director resolves staging ONCE for both prompts (Codex F5)", () => {
    expect(directorSource).toContain("stagingDirectorBlock(staging, input.campaignType)");
    expect(directorSource).toContain("stagingMode: resolveStagingMode(input)");
    expect(directorSource).toContain("const staging = resolveStagingMode(input);");
  });

  it("the system prompt no longer hardcodes handheld for every clip", () => {
    expect(systemPromptsSource).toContain("Never write \"handheld\" for a propped rig");
    expect(systemPromptsSource).not.toContain(
      "keep all segments handheld phone-style"
    );
  });

  it("the compose route resolves a pose and uses its prompt", () => {
    expect(routeSource).toContain("isComposePose(body.composePose)");
    expect(routeSource).toContain("composePosePrompt(composePose)");
  });

  it("the avatar step sends the pose and pins staging on approve/continue", () => {
    expect(ugcModeSource).toContain("composePose: activePose");
    expect(ugcModeSource).toContain("ugcComposeStaging: effectiveStaging");
    expect(ugcModeSource).toContain("selectedAttempt.pose !== activePose");
  });

  it("the composed reference's pose is authoritative at Continue (Codex F3/F4)", () => {
    expect(ugcModeSource).toContain("stagingModeForPose(composedPose)");
    expect(ugcModeSource).toContain("composedGalleryPoses");
    // Legacy composed gallery shots (no pose tag) read as holding.
    expect(ugcModeSource).toContain('isComposePose(poseTag) ? poseTag : "holding"');
  });

  it("the route rejects an invalid composePose instead of silently composing (Codex F7)", () => {
    expect(routeSource).toContain("composePose must be one of");
    expect(routeSource).toContain("compose-pose:${composePose}");
  });

  it("the base avatar prompt agrees with the pose (Codex F2)", () => {
    const promptSource = readFileSync(
      resolve(ROOT, "lib/seedance/ugc-image-prompt.ts"),
      "utf8"
    );
    expect(promptSource).toContain("pose === \"holding\"");
    expect(promptSource).toContain("propped up on the desk facing her");
  });

  it("the vision system prompt camera rules are rig-aware (Codex F1)", () => {
    expect(systemPromptsSource).toContain("PROPPED on the desk facing her");
    expect(systemPromptsSource).toContain("stable propped frame, candid expressions");
  });
});

describe("resolveStagingMode (Codex F5) + stagingModeForPose", () => {
  it("an explicit request wins", () => {
    expect(
      resolveStagingMode({
        stagingMode: "holding-selfie",
        influencerAlreadyHoldsProduct: false,
        campaignType: "unboxing",
      })
    ).toBe("holding-selfie");
  });

  it("a legacy composed request without staging metadata is a holding shot", () => {
    expect(
      resolveStagingMode({
        influencerAlreadyHoldsProduct: true,
        campaignType: "unboxing",
      })
    ).toBe("holding-selfie");
  });

  it("a non-composed request falls through to the campaign default", () => {
    expect(resolveStagingMode({ campaignType: "unboxing" })).toBe("desk-propped");
    expect(resolveStagingMode({ campaignType: "promo" })).toBe("holding-selfie");
  });

  it("a pose implies its rig", () => {
    expect(stagingModeForPose("holding")).toBe("holding-selfie");
    expect(stagingModeForPose("desk-closed")).toBe("desk-propped");
    expect(stagingModeForPose("desk-open")).toBe("desk-propped");
  });
});
