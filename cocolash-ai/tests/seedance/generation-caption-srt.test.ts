import { describe, it, expect } from "vitest";
import { buildGenerationCaptionSrt } from "@/app/api/seedance/generate/route";

/**
 * The Seedance "no captions" bug was upstream: the v4 wizard sends scriptText
 * but never a persisted scriptId, so the completion path (which used to look the
 * script up by script_id) found nothing and produced an uncaptioned video.
 *
 * buildGenerationCaptionSrt fixes that by building the SRT at generation time
 * straight from scriptText, and encodes the "Stylized captions" toggle as the
 * presence/absence of the returned SRT.
 */
describe("buildGenerationCaptionSrt", () => {
  const SCRIPT =
    "These lashes are doing the heavy lifting while I do absolutely nothing today.";

  it("builds an SRT from the script when captions are enabled (no script_id needed)", () => {
    const srt = buildGenerationCaptionSrt(SCRIPT, true, 15);
    expect(srt).toBeTruthy();
    expect(srt).toContain("-->"); // valid SRT cue
    expect(srt).not.toContain("undefined");
  });

  it("returns null when the toggle is OFF (captions disabled)", () => {
    expect(buildGenerationCaptionSrt(SCRIPT, false, 15)).toBeNull();
  });

  it("returns null when there is no script text to caption", () => {
    expect(buildGenerationCaptionSrt(undefined, true, 15)).toBeNull();
    expect(buildGenerationCaptionSrt("   ", true, 15)).toBeNull();
  });

  it("falls back to a sane duration when given a non-positive clip length", () => {
    const srt = buildGenerationCaptionSrt(SCRIPT, true, 0);
    expect(srt).toBeTruthy();
    expect(srt).toContain("-->");
  });
});
