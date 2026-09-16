/**
 * F10 — avatar quality (docs/seedance-2.5/06-QUALITY-PASS.md).
 *
 * The UGC avatar is the IDENTITY REFERENCE every Seedance frame is conditioned
 * on. Two things were actively working against it:
 *   1. it was rendered at 1K, and
 *   2. the prompt deliberately asked for jpeg compression artifacts, motion
 *      blur and low-light grain.
 *
 * Both are gone. What must SURVIVE is the natural-authenticity texture — pores,
 * under-eye texture, flyaway hairs, asymmetry — which is what makes it read as
 * a real phone photo rather than a render.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildUGCImagePrompt,
  IMPERFECTIONS,
  type UGCImageParams,
} from "@/lib/seedance/ugc-image-prompt";

const ROOT = resolve(__dirname, "../..");
const routeSource = readFileSync(
  resolve(ROOT, "app/api/seedance/generate-ugc-image/route.ts"),
  "utf8"
);

const BASE: UGCImageParams = {
  ethnicity: "Latina",
  skinTone: "Medium",
  ageRange: "25-34",
  hairStyle: "Wavy",
  scene: "casual-bedroom",
  vibe: "excited-discovery",
  lashStyle: "natural",
  hasProduct: false,
};

/** The imperfection pool is sampled randomly — sweep it. */
function promptsAcrossDraws(n = 60): string[] {
  return Array.from({ length: n }, () => buildUGCImagePrompt(BASE).prompt);
}

const DEGRADATION = [
  "jpeg compression",
  "compression artifacts",
  "motion blur",
  "grain",
];

describe("F10 — no deliberate degradation in the identity reference", () => {
  it("never asks for compression artifacts, motion blur or grain", () => {
    for (const prompt of promptsAcrossDraws()) {
      const lower = prompt.toLowerCase();
      for (const phrase of DEGRADATION) {
        // The only permitted mention is the explicit negation added by F10.
        const offending = lower
          .split(/(?<=\.)\s+/)
          .filter((s) => s.includes(phrase) && !s.includes("not compression artifacts"));
        expect(offending, `"${phrase}" still requested`).toEqual([]);
      }
    }
  });

  it("removed the three degrading entries from the imperfection pool", () => {
    const pool = IMPERFECTIONS.join(" | ").toLowerCase();
    expect(pool).not.toContain("jpeg");
    expect(pool).not.toContain("compression");
    expect(pool).not.toContain("motion blur");
    expect(pool).not.toContain("grain");
  });

  it("states positively that the capture is clean and in focus", () => {
    expect(buildUGCImagePrompt(BASE).prompt).toContain(
      "Sharp, clean, in-focus capture"
    );
  });
});

describe("F10 — natural-authenticity texture is preserved", () => {
  it("still asks for pores, under-eye texture and flyaway hairs", () => {
    const prompt = buildUGCImagePrompt(BASE).prompt;
    expect(prompt).toContain("pores");
    expect(prompt).toContain("under-eye texture");
    expect(prompt).toContain("flyaway hairs");
  });

  it("still asks for natural facial asymmetry", () => {
    expect(buildUGCImagePrompt(BASE).prompt).toContain(
      "Slight natural facial asymmetry"
    );
  });

  it("keeps a pool of real human imperfections to sample from", () => {
    expect(IMPERFECTIONS.length).toBeGreaterThanOrEqual(4);
    const pool = IMPERFECTIONS.join(" | ").toLowerCase();
    expect(pool).toContain("stray hair");
    expect(pool).toContain("flyaway hairs");
    expect(pool).toContain("blemish");
  });
});

describe("F10 — prompt structure is otherwise unchanged", () => {
  it("still opens with the raw smartphone-photo framing and the subject", () => {
    const prompt = buildUGCImagePrompt(BASE).prompt;
    expect(prompt.startsWith("Raw, unedited front-facing smartphone camera photo")).toBe(
      true
    );
    expect(prompt).toContain("25-34-year-old Latina woman");
  });

  it("still carries the scene, the vibe and the lash descriptor", () => {
    const prompt = buildUGCImagePrompt(BASE).prompt;
    expect(prompt).toContain("casual bedroom");
    expect(prompt).toContain("genuinely excited");
    expect(prompt).toContain("Her lashes show");
  });

  it("still emits the constant negative prompt", () => {
    const { negativePrompt } = buildUGCImagePrompt(BASE);
    expect(negativePrompt).toContain("CGI, 3D render, studio lighting");
    expect(negativePrompt).toContain("beauty filter");
  });

  it("still describes the product when one is composed in", () => {
    const prompt = buildUGCImagePrompt({
      ...BASE,
      hasProduct: true,
      productDescription: "the full lash kit (tan book-style box)",
    }).prompt;
    expect(prompt).toContain("casually holding the full lash kit (tan book-style box)");
  });
});

describe("F10 — the avatar route renders at 2K", () => {
  it("requests 2K from the Gemini generate helper", () => {
    expect(routeSource).toContain('"2K"');
  });

  it("no longer requests 1K", () => {
    expect(routeSource).not.toContain('"1K"');
  });
});
