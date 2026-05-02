/**
 * Unit tests for the parseIntent() helper.
 * The full classifyIntent() hits OpenRouter; covered indirectly by chat-eval.
 */

import { describe, it, expect } from "vitest";
import { parseIntent, INTENT_LABELS } from "./intent";

describe("parseIntent", () => {
  for (const label of INTENT_LABELS) {
    it(`recognises bare label "${label}"`, () => {
      expect(parseIntent(label)).toBe(label);
    });
    it(`recognises "${label.toUpperCase()}" with whitespace`, () => {
      expect(parseIntent(`  ${label.toUpperCase()}  `)).toBe(label);
    });
  }

  it("recognises a label as the first token", () => {
    // Strict prompt asks for the label as the only output. We only need to
    // recover from minor formatting like trailing newline or punctuation.
    expect(parseIntent("product\n")).toBe("product");
    expect(parseIntent("tryon\nokay")).toBe("tryon");
  });

  it("falls back to 'other' when an explanation precedes the label", () => {
    // The model sometimes prefixes 'Intent: x'. We treat this as malformed
    // and fall back rather than risk picking the wrong word.
    expect(parseIntent("Intent: tryon")).toBe("other");
  });

  it("falls back to 'other' when the label is unknown", () => {
    expect(parseIntent("unknown")).toBe("other");
    expect(parseIntent("")).toBe("other");
    expect(parseIntent("?!?!?")).toBe("other");
  });

  it("strips trailing punctuation", () => {
    expect(parseIntent("support.")).toBe("support");
    expect(parseIntent("lead_capture!")).toBe("lead_capture");
  });
});
