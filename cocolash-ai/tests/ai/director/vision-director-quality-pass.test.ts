/**
 * Package B — prompt-chain quality pass (docs/seedance-2.5/06-QUALITY-PASS.md).
 *
 * The Director was already honest (05-GROUNDING-FIX.md §1 established that every
 * claim it made was visible in the images). What it was NOT was craft-aware: it
 * wrote every prompt as if the clip were five seconds long in an unspecified
 * frame, never named a camera treatment, never saw the craft half of the
 * authoring rules, sampled at the provider's default temperature, buried the
 * creator behind scene-setting, and ended on dialogue.
 *
 * These tests hold the eight fixes in place:
 *  F2  duration + aspect reach the prompt; ≥10 s demands timed beats
 *  F3  one explicit camera clause per prompt (shot size + one motion)
 *  F4  BRAND_NEGATIVE_PROMPT (authoring rules) reaches the vision path
 *  F6  initial run at 0.35, Regenerate at 0.9
 *  F8  the output opens with the subject
 *  F9  the script sits in a delimited block, and a constraint line closes
 *  F13 every @-token is paired with a plain-noun restatement
 *  H4  composed-influencer awareness (no staged pickup)
 *
 * and check that none of them cost us a grounding guarantee.
 *
 * The OpenRouter client is mocked for the whole file: nothing here may reach a
 * real model. `applyProductGuard`'s F8 tail change is covered in
 * tests/seedance-v25/prompt-grounding-package-d.test.ts, next to the rest of the
 * guard's contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

const createMock = vi.fn();

vi.mock("@/lib/openrouter/client", () => ({
  getOpenRouterClient: () => ({
    chat: { completions: { create: createMock } },
  }),
  openrouterRequest: <T,>(run: () => Promise<T>) => run(),
}));

import {
  generateSeedanceVisionPrompt,
  splitPromptAndAudit,
  VISION_DIRECTOR_TEMPERATURE,
  VISION_DIRECTOR_VARIATION_TEMPERATURE,
  type VisionPromptInput,
} from "@/lib/ai/director/seedance-vision-director";
import {
  buildSeedanceVisionDirectorPrompt,
  describeVisionFrame,
  visionClipPlan,
  VISION_AUTO_PLAN_SECONDS,
  VISION_BEATS_MIN_SECONDS,
} from "@/lib/ai/director/system-prompts";
import { BRAND_NEGATIVE_PROMPT } from "@/lib/ai/director/negative-prompts";
import { POST as visionRoutePost } from "@/app/api/seedance/director-vision/route";

const ROOT = resolve(__dirname, "../../..");

const SYSTEM_PROMPTS_SOURCE = readFileSync(
  resolve(ROOT, "lib/ai/director/system-prompts.ts"),
  "utf8"
);
const STEP3_SOURCE = readFileSync(
  resolve(ROOT, "components/video/seedance-v4/Step3PromptReviewAndGenerate.tsx"),
  "utf8"
);

const IMAGE = "https://cdn.example.com/p1.jpg";

function input(overrides: Partial<VisionPromptInput> = {}): VisionPromptInput {
  return {
    influencerImageUrl: "https://cdn.example.com/influencer1.jpg",
    productImageUrls: [IMAGE, "https://cdn.example.com/p2.jpg"],
    script: "These lashes changed my morning routine.",
    campaignType: "product-showcase",
    ...overrides,
  };
}

function replyOnce(content = "prompt", finishReason = "stop") {
  createMock.mockResolvedValueOnce({
    choices: [{ message: { content }, finish_reason: finishReason }],
  });
}

function lastCall() {
  const args = createMock.mock.calls.at(-1)?.[0] as {
    temperature?: number;
    messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;
  };
  const system = args.messages[0].content as string;
  const parts = args.messages[1].content as Array<{ type: string; text?: string }>;
  return { args, system, user: parts.find((p) => p.type === "text")?.text ?? "" };
}

/** Run the director once and hand back what the model was actually sent. */
async function build(overrides: Partial<VisionPromptInput> = {}) {
  replyOnce();
  await generateSeedanceVisionPrompt(input(overrides));
  return lastCall();
}

beforeEach(() => {
  createMock.mockReset();
});

// ── F2. The clip the user actually ordered ───────────────────

describe("F2 — the Director is told how long the clip is and what frame it ships in", () => {
  it("plans Auto (-1) as a ~10 s clip", () => {
    for (const duration of [undefined, -1, Number.NaN]) {
      const plan = visionClipPlan(duration);
      expect(plan.isAuto).toBe(true);
      expect(plan.plannedSeconds).toBe(VISION_AUTO_PLAN_SECONDS);
      expect(VISION_AUTO_PLAN_SECONDS).toBe(10);
    }
  });

  it.each([
    [4, false],
    [6, false],
    [8, false],
    [9, false],
    [10, true],
    [12, true],
    [30, true],
  ])("requires beats at %is: %s", (seconds, needsBeats) => {
    expect(visionClipPlan(seconds).needsBeats).toBe(needsBeats);
    expect(VISION_BEATS_MIN_SECONDS).toBe(10);
  });

  it("lays beats end to end with no gap, no overlap and no stub", () => {
    expect(visionClipPlan(10).beats).toEqual(["[0–5s]", "[5–10s]"]);
    expect(visionClipPlan(12).beats).toEqual(["[0–5s]", "[5–12s]"]);
    expect(visionClipPlan(15).beats).toEqual(["[0–5s]", "[5–10s]", "[10–15s]"]);

    for (const seconds of [10, 11, 12, 13, 15, 20, 24, 30]) {
      const beats = visionClipPlan(seconds).beats;
      const bounds = beats.map((b) => b.match(/\[(\d+)–(\d+)s\]/)!.slice(1).map(Number));
      expect(bounds[0][0]).toBe(0);
      expect(bounds.at(-1)![1]).toBe(seconds);
      bounds.forEach(([start, end], i) => {
        expect(end).toBeGreaterThan(start);
        if (i > 0) expect(start).toBe(bounds[i - 1][1]);
      });
    }
  });

  it("names the frame in words the video model responds to", () => {
    expect(describeVisionFrame("9:16")).toBe("vertical 9:16 phone frame");
    expect(describeVisionFrame("16:9")).toBe("horizontal 16:9 frame");
    expect(describeVisionFrame("1:1")).toBe("square 1:1 frame");
    expect(describeVisionFrame(undefined)).toBe("vertical 9:16 phone frame");
    expect(describeVisionFrame("weird")).toBe("weird frame");
  });

  it("states the runtime and the frame in the system prompt", () => {
    const prompt = buildSeedanceVisionDirectorPrompt({
      productImageCount: 2,
      durationSeconds: 12,
      aspectRatio: "9:16",
    });
    expect(prompt).toContain("CLIP LENGTH AND FRAME:");
    expect(prompt).toContain("This clip runs 12 seconds");
    expect(prompt).toContain("vertical 9:16 phone frame");
  });

  it("demands timed beats covering the whole runtime at ≥10 s", () => {
    const prompt = buildSeedanceVisionDirectorPrompt({
      productImageCount: 2,
      durationSeconds: 12,
    });
    expect(prompt).toMatch(/MUST be structured into timed beats/);
    expect(prompt).toContain("[0–5s] …");
    expect(prompt).toContain("[5–12s] …");
    expect(prompt).toMatch(/no gap and no overlap/);
    expect(prompt).toMatch(/the last one ends at 12s/);
    // Padding a long clip with invented product business is the failure mode
    // the beats must not create.
    expect(prompt).toMatch(/rather than inventing another product interaction/);
  });

  it("forbids shot labels under 10 s", () => {
    const prompt = buildSeedanceVisionDirectorPrompt({
      productImageCount: 2,
      durationSeconds: 8,
    });
    expect(prompt).toContain("This clip runs 8 seconds");
    expect(prompt).toMatch(/single-beat clip/);
    expect(prompt).toMatch(/Do NOT split it into timed shot labels/);
    expect(prompt).not.toContain("[0–5s]");
    expect(prompt).not.toMatch(/MUST be structured into timed beats/);
  });

  it("treats Auto as a beat-bearing clip planned at ~10 s", () => {
    const prompt = buildSeedanceVisionDirectorPrompt({
      productImageCount: 2,
      durationSeconds: -1,
    });
    expect(prompt).toMatch(/runs on AUTO/);
    expect(prompt).toContain("plan for about 10 seconds");
    expect(prompt).toContain("[0–5s] …");
    expect(prompt).toContain("[5–10s] …");
  });

  it("mirrors the text Director's beat language rather than inventing a format", () => {
    // seedance-director UGC prompt: "Use shot labels ([0-5s], [5-10s], etc.)".
    expect(SYSTEM_PROMPTS_SOURCE).toContain("Use shot labels ([0-5s], [5-10s], etc.)");
    expect(buildSeedanceVisionDirectorPrompt({ durationSeconds: 15 })).toMatch(
      /\[0–5s\] …\n\[5–10s\] …\n\[10–15s\] …/
    );
  });

  it("carries duration and frame end to end, into both prompts", async () => {
    const { system, user } = await build({
      durationSeconds: 15,
      aspectRatio: "9:16",
    });
    expect(system).toContain("This clip runs 15 seconds");
    expect(system).toContain("vertical 9:16 phone frame");
    expect(user).toContain("Clip length: 15 seconds");
    expect(user).toContain("Frame: vertical 9:16 phone frame");
  });

  it("says Auto in the user prompt too when the caller sent -1", async () => {
    const { user } = await build({ durationSeconds: -1 });
    expect(user).toContain("Clip length: Auto (the model picks)");
    expect(user).toContain("plan for about 10 seconds");
  });

  it("reports the clip it planned for in diagnostics", async () => {
    replyOnce();
    const auto = await generateSeedanceVisionPrompt(input({ durationSeconds: -1 }));
    expect(auto.diagnostics.inputSummary).toContain("duration=auto");

    replyOnce();
    const fixed = await generateSeedanceVisionPrompt(
      input({ durationSeconds: 12, aspectRatio: "16:9" })
    );
    expect(fixed.diagnostics.inputSummary).toContain("duration=12s");
    expect(fixed.diagnostics.inputSummary).toContain("aspect=16:9");
  });

  it("Step 3 sends the wizard's real duration and aspect", () => {
    expect(STEP3_SOURCE).toContain("durationSeconds: effectiveDuration(state),");
    expect(STEP3_SOURCE).toContain("aspectRatio: state.aspectRatio,");
  });
});

// ── F3. Camera vocabulary ────────────────────────────────────

describe("F3 — every prompt carries an explicit camera treatment", () => {
  const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 2 });

  it("requires a shot size and one motion", () => {
    expect(prompt).toMatch(/Give the CAMERA an explicit treatment/);
    expect(prompt).toMatch(/SHOT SIZE \(close-up · medium close-up · medium · wide\)/);
    expect(prompt).toMatch(/ONE motion \(slow push-in · handheld follow · static with natural sway\)/);
  });

  it("phrases it as handheld phone footage, not a film crew", () => {
    expect(prompt).toMatch(/handheld phone footage/);
    expect(prompt).toMatch(/never a crane, dolly, drone or steadicam/);
    expect(prompt).toMatch(/never the empty phrase "cinematic movement"/);
  });

  it("is one clause, not a film-school essay", () => {
    const occurrences = prompt.split("Give the CAMERA an explicit treatment").length - 1;
    expect(occurrences).toBe(1);
    const clause = prompt
      .split("Give the CAMERA an explicit treatment")[1]
      .split("\n\n")[0];
    expect(clause.length).toBeLessThan(500);
  });

  it("asks for the treatment per beat on a multi-beat clip", () => {
    expect(
      buildSeedanceVisionDirectorPrompt({ durationSeconds: 12 })
    ).toMatch(/every prompt, and every beat/);
    expect(
      buildSeedanceVisionDirectorPrompt({ durationSeconds: 6 })
    ).toMatch(/every prompt, once/);
  });
});

// ── F4. The craft rules reach the vision path ────────────────

describe("F4 — BRAND_NEGATIVE_PROMPT reaches the vision Director", () => {
  it("appends the shared authoring rules verbatim", () => {
    expect(buildSeedanceVisionDirectorPrompt({ productImageCount: 2 })).toContain(
      BRAND_NEGATIVE_PROMPT
    );
  });

  it("carries the craft half the vision path never used to see", () => {
    const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 2 });
    expect(prompt).toMatch(/anatomy stays correct and hands stay natural/);
    expect(prompt).toMatch(/framing stays steady/);
    expect(prompt).toMatch(/brand text stays legible/);
    expect(prompt).toMatch(/colour stays natural and true to the reference images/);
  });

  it("imports the block instead of restating it by hand", () => {
    expect(SYSTEM_PROMPTS_SOURCE).toContain(
      'import { BRAND_NEGATIVE_PROMPT } from "./negative-prompts";'
    );
    // The craft lines live in exactly one file. If they were ever pasted into
    // system-prompts.ts, the two copies would drift.
    expect(SYSTEM_PROMPTS_SOURCE).not.toContain(
      "anatomy stays correct and hands stay natural"
    );
  });

  it("keeps the authoring rules as rules — they are not text to emit (G5)", () => {
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/Never copy these lines/);
    const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 2 });
    expect(prompt).toMatch(/Never put a negation in the prompt/);
  });

  it("reaches the model on a live call", async () => {
    const { system } = await build();
    expect(system).toContain(BRAND_NEGATIVE_PROMPT);
  });
});

// ── F6. Temperature ──────────────────────────────────────────

describe("F6 — the first run is grounded, the Regenerate is hot", () => {
  it("pins the two temperatures", () => {
    expect(VISION_DIRECTOR_TEMPERATURE).toBe(0.35);
    expect(VISION_DIRECTOR_VARIATION_TEMPERATURE).toBe(0.9);
  });

  it("sends 0.35 explicitly on the initial run (was: provider default)", async () => {
    const { args } = await build();
    expect(args.temperature).toBe(0.35);
  });

  it("sends 0.9 on an explicit Regenerate", async () => {
    const { args } = await build({ variationHint: "Give me a fresh take." });
    expect(args.temperature).toBe(0.9);
  });
});

// ── F8. Identity first ───────────────────────────────────────

describe("F8 — the prompt must open with the subject", () => {
  const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 2 });

  it("puts the creator in the first sentence, before scene and product", () => {
    expect(prompt).toContain("OPEN WITH THE CREATOR — NON-NEGOTIABLE:");
    expect(prompt).toMatch(/FIRST SENTENCE of the prompt must name the subject/);
    expect(prompt).toMatch(/the creator from @influencer_image1/);
    expect(prompt).toMatch(
      /before the room, before the lighting, before the product/
    );
  });

  it("forbids anything being prepended ahead of her", () => {
    expect(prompt).toMatch(/Nothing may be prepended ahead of her/);
    expect(prompt).toMatch(/not a category line/);
    expect(prompt).toMatch(/if the product opens the prompt, identity drifts/i);
  });
});

// ── F9. Dialogue placement ───────────────────────────────────

describe("F9 — the script is delimited and never the last thing read", () => {
  const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 2 });

  it("puts the script in a labelled block", () => {
    expect(prompt).toContain('SPOKEN SCRIPT — verbatim dialogue, not staging: "[the script]"');
    expect(prompt).toMatch(/words inside are to be SPOKEN, not rendered as on-screen text/);
  });

  it("drops the old bare 'Script she is speaking:' phrasing", () => {
    expect(prompt).not.toContain("Script she is speaking:");
    expect(SYSTEM_PROMPTS_SOURCE).not.toContain("Script she is speaking:");
  });

  it("closes the prompt with a one-line visual constraint tail", () => {
    expect(prompt).toMatch(
      /CLOSE the prompt with a one-line visual constraint tail AFTER the script block/
    );
    expect(prompt).toMatch(/the last thing the model reads must be the constraint/);
    expect(prompt).toMatch(/Framing stays steady/);
    expect(prompt).toMatch(/identity stays consistent with @influencer_image1/i);
    expect(prompt).toMatch(/product stays exactly as the product references show it/i);
  });

  it("still reproduces the script word-for-word except for audited claims", () => {
    expect(prompt).toMatch(/Reproduce it word-for-word EXCEPT/);
  });

  it("keeps scriptAudit working on a reply shaped the new way", () => {
    const { prompt: body, scriptAudit } = splitPromptAndAudit(
      [
        "Maya, mid-20s, holds @product_image1, the tan lash kit box, to camera.",
        "",
        'SPOKEN SCRIPT — verbatim dialogue, not staging: "These lashes changed my routine."',
        "",
        "Framing stays steady, her identity stays consistent, the product stays exactly as shown.",
        "",
        "---SCRIPT AUDIT---",
        '- dropped "glass cover" — no glass appears in any image',
      ].join("\n")
    );

    expect(body).toContain("SPOKEN SCRIPT — verbatim dialogue, not staging:");
    expect(body.trim().endsWith("the product stays exactly as shown.")).toBe(true);
    expect(body).not.toMatch(/glass cover/);
    expect(scriptAudit).toEqual([
      'dropped "glass cover" — no glass appears in any image',
    ]);
  });
});

// ── F13. Token + noun pairing ────────────────────────────────

describe("F13 — every @-token is paired with a plain noun", () => {
  const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 3 });

  it("states the rule in the KEY RULES section", () => {
    expect(prompt).toContain("PAIR EVERY TOKEN WITH A PLAIN NOUN:");
    const keyRulesIndex = prompt.indexOf("KEY RULES FOR @-MENTION TOKENS:");
    const pairingIndex = prompt.indexOf("PAIR EVERY TOKEN WITH A PLAIN NOUN:");
    expect(keyRulesIndex).toBeGreaterThanOrEqual(0);
    expect(pairingIndex).toBeGreaterThan(keyRulesIndex);
  });

  it("shows the shape with worked examples", () => {
    expect(prompt).toContain('"@product_image1, the tan lash kit box"');
    expect(prompt).toMatch(/@influencer_image1, the creator with the dark curls/);
    expect(prompt).toMatch(/Never leave a bare token standing on its own/);
  });

  it("draws its bracket example from a token that actually exists", () => {
    // A worked example naming @product_image3 to a Director holding two images
    // is an invitation to describe an image it was never given.
    expect(prompt).toContain(
      '"@product_image3 (the opened box, fitted tray of tools visible)"'
    );
    const twoImages = buildSeedanceVisionDirectorPrompt({ productImageCount: 2 });
    expect(twoImages).toContain(
      '"@product_image2 (the opened box, fitted tray of tools visible)"'
    );
    expect(twoImages).not.toContain("@product_image3 (the opened box");
  });

  it("explains why: 2.5 may treat the tokens as plain text", () => {
    expect(prompt).toMatch(/unverified on 2\.5/);
    expect(prompt).toMatch(/the sentence must still read correctly/);
  });
});

// ── H4. Composed influencer ──────────────────────────────────

describe("H4 — the composed avatar already holds the product", () => {
  const composed = buildSeedanceVisionDirectorPrompt({
    productImageCount: 2,
    influencerAlreadyHoldsProduct: true,
  });
  const plain = buildSeedanceVisionDirectorPrompt({ productImageCount: 2 });

  it("tells the writer the creator is already holding it", () => {
    expect(composed).toContain("THE CREATOR IS ALREADY HOLDING THE PRODUCT:");
    expect(composed).toMatch(
      /@influencer_image1 already shows the creator holding this product/
    );
  });

  it("forbids staging a pickup", () => {
    expect(composed).toMatch(/Do NOT stage a pickup/);
    expect(composed).toMatch(/no picking it up off a counter/);
    expect(composed).toMatch(/already in her hands when the clip starts/);
  });

  it("forbids re-introducing the product as if it were new", () => {
    expect(composed).toMatch(/Do NOT re-introduce the product as if it were new/);
    expect(composed).toMatch(/established in frame from the first second/);
  });

  it("keeps the PRODUCT references authoritative for appearance (H2)", () => {
    expect(composed).toMatch(
      /@product_image1, @product_image2\) stay authoritative for what the product looks like/
    );
    expect(composed).toMatch(/never from the composed influencer frame/);
    expect(composed).toMatch(/only for grip, pose and scale/);
  });

  it("says none of that when the influencer image is a plain portrait", () => {
    expect(plain).not.toContain("THE CREATOR IS ALREADY HOLDING THE PRODUCT:");
    expect(plain).not.toMatch(/Do NOT stage a pickup/);
  });

  it("changes the staging instruction end to end", async () => {
    const composedCall = await build({ influencerAlreadyHoldsProduct: true });
    expect(composedCall.system).toContain("THE CREATOR IS ALREADY HOLDING THE PRODUCT:");
    expect(composedCall.user).toMatch(/ALREADY holding this product/);

    const plainCall = await build();
    expect(plainCall.system).not.toContain("THE CREATOR IS ALREADY HOLDING THE PRODUCT:");
    expect(plainCall.user).not.toMatch(/ALREADY holding this product/);
  });

  it("Step 3 sends the wizard's compose flag", () => {
    expect(STEP3_SOURCE).toContain(
      "influencerAlreadyHoldsProduct: state.ugcWasComposed === true,"
    );
  });
});

// ── The grounding guarantees survive all of it ───────────────

describe("no quality fix costs a grounding guarantee", () => {
  const combinations = [
    { label: "4 s, composed", durationSeconds: 4, influencerAlreadyHoldsProduct: true },
    { label: "12 s, 9:16", durationSeconds: 12, aspectRatio: "9:16" },
    { label: "auto, 1:1", durationSeconds: -1, aspectRatio: "1:1" },
    { label: "30 s, composed", durationSeconds: 30, influencerAlreadyHoldsProduct: true },
  ];

  it.each(combinations)("keeps the script audit + every-image rules at $label", (options) => {
    const prompt = buildSeedanceVisionDirectorPrompt({
      productImageCount: 4,
      ...options,
    });

    // Script audit (05-GROUNDING-FIX.md §4 B)
    expect(prompt).toContain("AUDIT THE SCRIPT BEFORE YOU WRITE:");
    expect(prompt).toMatch(/written by someone who never saw this product/i);
    expect(prompt).toContain("---SCRIPT AUDIT---");

    // Every image gets described
    expect(prompt).toContain("USE EVERY PRODUCT IMAGE — NON-NEGOTIABLE");
    expect(prompt).toMatch(/MUST reference every single one of those 4 tokens/);
    for (const token of ["@product_image1", "@product_image4"]) {
      expect(prompt).toContain(token);
    }
    expect(prompt).not.toContain("@product_image5");

    // G5 — positive description only
    expect(prompt).toMatch(/Never put a negation in the prompt/);
    expect(prompt).toMatch(/render the negated noun/);

    // No invented features
    expect(prompt).toMatch(/There is no fourth source/);
    expect(prompt).toMatch(/If the images do not show it, it does not exist for this video/);
  });

  it("never asserts a brand claim of its own, at any setting", () => {
    for (const options of combinations) {
      const prompt = buildSeedanceVisionDirectorPrompt({
        productImageCount: 4,
        ...options,
      });
      expect(prompt).not.toContain("Based on what you see in the images:");
      expect(prompt).not.toContain("do NOT have magnetic closures");
      expect(prompt).not.toMatch(/cotton band/i);
      expect(prompt).not.toMatch(/25\+ wears/);
    }
  });
});

// ── The route carries the three new fields ───────────────────

describe("POST /api/seedance/director-vision — the new fields", () => {
  function post(body: Record<string, unknown>): NextRequest {
    return new NextRequest("https://app.example.com/api/seedance/director-vision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        influencerImageUrl: "https://cdn.example.com/influencer1.jpg",
        productImageUrls: [IMAGE],
        script: "These lashes changed my morning routine.",
        campaignType: "product-showcase",
        ...body,
      }),
    });
  }

  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({
      choices: [{ message: { content: "prompt" }, finish_reason: "stop" }],
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes duration, aspect and the compose flag into the system prompt", async () => {
    const response = await visionRoutePost(
      post({
        durationSeconds: 12,
        aspectRatio: "9:16",
        influencerAlreadyHoldsProduct: true,
      })
    );

    expect(response.status).toBe(200);
    const { system } = lastCall();
    expect(system).toContain("This clip runs 12 seconds");
    expect(system).toContain("vertical 9:16 phone frame");
    expect(system).toContain("[5–12s] …");
    expect(system).toContain("THE CREATOR IS ALREADY HOLDING THE PRODUCT:");
  });

  it("accepts -1 (Auto) and plans ~10 s", async () => {
    const response = await visionRoutePost(post({ durationSeconds: -1 }));
    expect(response.status).toBe(200);
    expect(lastCall().system).toMatch(/runs on AUTO/);
  });

  it("still works when the caller sends none of them", async () => {
    const response = await visionRoutePost(post({}));
    expect(response.status).toBe(200);
    const { system } = lastCall();
    expect(system).toContain("vertical 9:16 phone frame");
    expect(system).not.toContain("THE CREATOR IS ALREADY HOLDING THE PRODUCT:");
  });

  it.each([
    ["zero", 0],
    ["below Auto", -2],
    ["over the 30 s cap", 31],
    ["fractional", 7.5],
  ])("400s on a %s durationSeconds without calling the model", async (_label, value) => {
    const response = await visionRoutePost(post({ durationSeconds: value }));
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400s on a non-boolean compose flag", async () => {
    const response = await visionRoutePost(
      post({ influencerAlreadyHoldsProduct: "yes" })
    );
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });
});
