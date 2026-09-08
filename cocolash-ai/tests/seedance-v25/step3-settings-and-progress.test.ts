/**
 * Step 3 wiring guards. There is no DOM environment in this suite (vitest runs
 * `environment: "node"`), so these assert the two invariants directly on the
 * component source — the same approach tests/seedance-v25/migration-sql.test.ts
 * uses for the migration file.
 *
 * Both invariants are money/UX bugs when they regress:
 *
 *  1. On engine 2.5 the legacy <EnhancorSettingsPanel> must be a READ-ONLY
 *     recap. Its interactive Resolution control writes `state.resolution` and
 *     never touches `state.qualityTier`, while the 2.5 request is built from
 *     the tier — so an interactive panel here can queue (and bill) a job at a
 *     resolution the rest of the wizard never showed. Step 1's
 *     OutputSettingsPanel owns 2.5 output settings.
 *  2. Once a job is queued, Step 3 IS the live progress card. Re-running the
 *     Director would flip the loading flag, hit a loading early-return and
 *     unmount <SeedanceGenerationProgress> — killing its status poll.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const step3 = readFileSync(
  resolve(ROOT, "components/video/seedance-v4/Step3PromptReviewAndGenerate.tsx"),
  "utf8"
);
const panel = readFileSync(
  resolve(ROOT, "components/video/seedance-v4/EnhancorSettingsPanel.tsx"),
  "utf8"
);

describe("Step 3 — EnhancorSettingsPanel is read-only on engine 2.5", () => {
  it("passes setState={undefined} for 2.5 and for Enhancor-parity UGC", () => {
    expect(step3).toContain(
      'setState={state.engine === "2.5" || isEnhancorParityMode ? undefined : setState}'
    );
  });

  it("does not pass the bare setState to the panel any more", () => {
    expect(step3).not.toMatch(/<EnhancorSettingsPanel[\s\S]{0,200}setState=\{setState\}/);
  });

  it("the panel treats a missing setState as read-only", () => {
    expect(panel).toContain("const isReadOnly = !setState;");
  });

  it("the panel's Resolution control writes `resolution` and NOT `qualityTier` (why 2.5 must be read-only)", () => {
    expect(panel).toContain("setState({ resolution: r.value })");
    expect(panel).not.toContain("setState({ qualityTier");
  });
});

describe("EnhancorSettingsPanel — the multi-frame hint follows the engine", () => {
  it("no longer hard-codes the 2.0 cap", () => {
    expect(panel).not.toContain("4–15 s total");
  });

  it("reads the selected engine's real duration range", () => {
    expect(panel).toContain(
      "const engineCaps = SEEDANCE_ENGINES[state.engine].capabilities;"
    );
    expect(panel).toContain("{engineCaps.durationMin}–{engineCaps.durationMax} s total");
  });
});

describe("Step 3 — the live progress card survives", () => {
  it("skips the auto-Director effect while a generation is in flight", () => {
    // The guard must be the FIRST thing the effect does.
    const effect = step3.slice(step3.indexOf("useEffect(() => {\n    // Once a job is queued"));
    expect(effect).toContain("if (generation) return;");
    expect(effect.indexOf("if (generation) return;")).toBeLessThan(
      effect.indexOf("isEnhancorParityMode")
    );
  });

  it("lists `generation` in that effect's dependencies", () => {
    expect(step3).toContain(
      "}, [state.inputsVersion, state.directorPromptVersion, isEnhancorParityMode, generation]);"
    );
  });

  it("never takes a loading early-return while a generation is in flight", () => {
    expect(step3).toContain("if (!generation && isEnhancorParityMode && visionLoading) {");
    expect(step3).toContain("if (!generation && !isEnhancorParityMode && isWriting) {");
    // The unguarded forms are exactly what unmounted the progress card.
    expect(step3).not.toContain("if (isEnhancorParityMode && visionLoading) {");
    expect(step3).not.toContain("if (!isEnhancorParityMode && isWriting) {");
  });

  it("still renders SeedanceGenerationProgress off the `generation` state", () => {
    expect(step3).toContain("{generation ? (");
    expect(step3).toContain("<SeedanceGenerationProgress");
    expect(step3).toContain("videoId={generation.videoId}");
  });
});
