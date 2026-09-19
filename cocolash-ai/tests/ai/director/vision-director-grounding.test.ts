/**
 * Package B — the Director audits the script, and uses every image.
 *
 * Context (docs/seedance-2.5/05-GROUNDING-FIX.md §1): the Vision Director was
 * NOT the hallucinator. Every claim it made ("mirror inside the lid", "magnetic
 * lid", "fitted tray") is true and visible in the product images. "Glass cover"
 * arrived from the blind script writer upstream and reached the screen because
 * this Director was ordered to append the script verbatim with zero
 * reconciliation, and because it described only 3–5 of the 8 images it was
 * given — the undescribed angles are where the video model invents.
 *
 * These tests hold the fix in place:
 *  - the system prompt orders an audit of the script against the images
 *  - it demands one @product_imageN reference per supplied image
 *  - product-interaction actions are gated on visibility
 *  - the three hardcoded brand assertions are gone
 *  - a truncated completion raises instead of returning a cut-off prompt
 *  - the audit never leaks into the prompt that goes to Seedance
 *
 * The OpenRouter client is mocked for the whole file: nothing here may reach a
 * real model.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  isTruncatedFinishReason,
  VisionDirectorError,
  VISION_DIRECTOR_MAX_TOKENS,
  SEEDANCE_VISION_DIRECTOR_PROMPT_ID,
  type VisionPromptInput,
} from "@/lib/ai/director/seedance-vision-director";
import {
  buildSeedanceVisionDirectorPrompt,
  productImageTokens,
  PROMPT_REGISTRY,
  SEEDANCE_VISION_DIRECTOR_PROMPT,
} from "@/lib/ai/director/system-prompts";

const ROOT = resolve(__dirname, "../../..");

const DIRECTOR_SOURCE = readFileSync(
  resolve(ROOT, "lib/ai/director/seedance-vision-director.ts"),
  "utf8"
);
const SYSTEM_PROMPTS_SOURCE = readFileSync(
  resolve(ROOT, "lib/ai/director/system-prompts.ts"),
  "utf8"
);
const STEP3_SOURCE = readFileSync(
  resolve(ROOT, "components/video/seedance-v4/Step3PromptReviewAndGenerate.tsx"),
  "utf8"
);

function images(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://cdn.example.com/p${i + 1}.jpg`);
}

function input(overrides: Partial<VisionPromptInput> = {}): VisionPromptInput {
  return {
    influencerImageUrl: "https://cdn.example.com/influencer1.jpg",
    productImageUrls: images(3),
    script: "This kit has a glass cover and I am obsessed.",
    campaignType: "product-showcase",
    ...overrides,
  };
}

function replyOnce(content: string, finishReason: string | undefined = "stop") {
  createMock.mockResolvedValueOnce({
    choices: [{ message: { content }, finish_reason: finishReason }],
  });
}

/** The arguments the vision model was actually called with. */
function lastCall() {
  const args = createMock.mock.calls.at(-1)?.[0] as {
    max_tokens: number;
    temperature?: number;
    messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;
  };
  const system = args.messages[0].content as string;
  const parts = args.messages[1].content as Array<{ type: string; text?: string }>;
  const user = parts.find((p) => p.type === "text")?.text ?? "";
  return { args, system, user };
}

beforeEach(() => {
  createMock.mockReset();
});

// ── 1. The audit instruction ─────────────────────────────────

describe("the system prompt orders an audit of the script against the images", () => {
  const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 3 });

  it("tells the Director the script writer never saw the product", () => {
    expect(prompt).toMatch(/AUDIT THE SCRIPT BEFORE YOU WRITE/);
    expect(prompt).toMatch(/written by someone who never saw this product/i);
    expect(prompt).toMatch(/dialogue, not evidence/i);
  });

  it("names the physical-form claims to check (the 'glass cover' class)", () => {
    expect(prompt).toMatch(/glass/i);
    expect(prompt).toMatch(/transparency|transparen/i);
    expect(prompt).toMatch(/mirror/i);
    expect(prompt).toMatch(/closure/i);
  });

  it("forbids staging any claim it cannot see in the images", () => {
    expect(prompt).toMatch(/cannot see: never turn it into a visual beat/i);
    expect(prompt).toMatch(/do not stage it, do not describe it/i);
  });

  it("prefers rewording a false line over deleting the dialogue", () => {
    expect(prompt).toMatch(/reword the minimum number of words/i);
    expect(prompt).toMatch(/meaning, tone and CTA stay/i);
  });

  it("no longer orders the script appended verbatim with no reconciliation", () => {
    expect(prompt).not.toContain("Append the spoken SCRIPT verbatim");
    expect(prompt).toMatch(/Reproduce it word-for-word EXCEPT/);
  });

  it("requires the changes to be reported in a SCRIPT AUDIT block", () => {
    expect(prompt).toContain("---SCRIPT AUDIT---");
    expect(prompt).toMatch(/Never mention the audit inside the prompt itself/i);
  });

  it("bans negations in the outgoing prompt (G5 — models render negated nouns)", () => {
    expect(prompt).toMatch(/Never put a negation in the prompt/i);
    expect(prompt).toMatch(/render the negated noun/i);
  });
});

// ── 2. Every image gets used ─────────────────────────────────

describe("the system prompt requires every supplied product image to be referenced", () => {
  it("states the every-image rule", () => {
    const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 8 });
    expect(prompt).toContain("USE EVERY PRODUCT IMAGE — NON-NEGOTIABLE");
    expect(prompt).toMatch(/MUST reference every single one of those 8 tokens/);
    expect(prompt).toMatch(/SHORT, concrete description of what THAT image shows/);
    expect(prompt).toMatch(/gap the video model fills by inventing/);
  });

  it.each([1, 3, 5, 8, 29])("enumerates exactly %i product tokens for %i images", (n) => {
    const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: n });
    for (const token of productImageTokens(n)) {
      expect(prompt).toContain(token);
    }
    // Token N+1 must never appear — no phantom image to describe.
    expect(prompt).not.toContain(`@product_image${n + 1} `);
    expect(prompt).not.toContain(`@product_image${n + 1},`);
  });

  it("the built prompts reference N tokens for N images end to end", async () => {
    replyOnce("Using @influencer_image1 she holds the kit.");
    await generateSeedanceVisionPrompt(input({ productImageUrls: images(8) }));

    const { system, user } = lastCall();
    for (const token of productImageTokens(8)) {
      expect(system).toContain(token);
      expect(user).toContain(token);
    }
    // The user prompt lists one image line per product token, mapped to its
    // position in the submitted image array (influencer first).
    expect(user).toContain("[Image 2: product angle → @product_image1]");
    expect(user).toContain("[Image 9: product angle → @product_image8]");
    expect(user).toContain("Reference all 8 product tokens");
  });

  it("keeps token order aligned when several influencer references are sent", async () => {
    replyOnce("prompt");
    await generateSeedanceVisionPrompt(
      input({
        influencerImageUrls: [
          "https://cdn.example.com/influencer1.jpg",
          "https://cdn.example.com/influencer2.jpg",
        ],
        productImageUrls: images(2),
      })
    );

    const { system, user } = lastCall();
    expect(system).toContain("@influencer_image1…@influencer_image2");
    expect(user).toContain("[Image 3: product angle → @product_image1]");
    expect(user).toContain("[Image 4: product angle → @product_image2]");
  });
});

// ── 3. Visibility-gated action menu ──────────────────────────

describe("product interactions are gated on what the images actually show", () => {
  const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 4 });

  it("no longer offers the interactions unconditionally", () => {
    expect(prompt).not.toContain('   - "opens the box"\n');
    expect(prompt).not.toContain('   - "points to the tray"\n');
    expect(prompt).not.toContain('   - "demonstrates the bands"\n');
  });

  it("attaches a visibility condition to each interaction", () => {
    expect(prompt).toMatch(/ONLY when the thing being interacted with is visible/i);
    expect(prompt).toMatch(/"opens the box".*only if the images show a box/);
    expect(prompt).toMatch(/"points to the tray".*only if a tray or fitted insert is visible/);
    expect(prompt).toMatch(/"demonstrates the bands".*only if individual lashes/);
  });

  it("gives an always-safe fallback so the Director is not left with nothing", () => {
    expect(prompt).toMatch(/Always safe, because they involve the creator/i);
    expect(prompt).toMatch(/If none of the interaction actions are supported/i);
  });
});

// ── 4. The hardcoded brand assertions are gone ───────────────

describe("the three hardcoded brand assertions are deleted", () => {
  const everywhere = [
    buildSeedanceVisionDirectorPrompt({ productImageCount: 3 }),
    DIRECTOR_SOURCE,
    SYSTEM_PROMPTS_SOURCE,
  ];

  it.each([
    ["cluster/wispy on FLEXIBLE bands", "cluster/wispy bands on FLEXIBLE bands"],
    ["trays have no magnetic closure", "do NOT have magnetic closures"],
    ["black hardcover book/tray", "hardcover-style book or tray"],
  ])("no longer asserts %s", (_label, claim) => {
    for (const text of everywhere) expect(text).not.toContain(claim);
  });

  it("no longer frames brand copy as an observation of the images", () => {
    for (const text of everywhere) {
      expect(text).not.toContain("Based on what you see in the images:");
    }
  });

  it("replaces them with a ranked list of real sources", () => {
    const prompt = buildSeedanceVisionDirectorPrompt({ productImageCount: 3 });
    expect(prompt).toMatch(/The product images themselves — PRIMARY/);
    expect(prompt).toMatch(/verified product facts in the user message/i);
    expect(prompt).toMatch(/supplementary product database block/i);
    expect(prompt).toMatch(/There is no fourth source/);
  });

  it("passes the caller's productFacts through to the user prompt", async () => {
    replyOnce("prompt");
    await generateSeedanceVisionPrompt(
      input({ productFacts: "WHAT THE PRODUCT ACTUALLY IS: tan rigid kit box" })
    );
    expect(lastCall().user).toContain("tan rigid kit box");
  });

  it("renders per-SKU truth (not brand-wide claims) when productSku is supplied", async () => {
    replyOnce("prompt");
    await generateSeedanceVisionPrompt(input({ productSku: "kit-daisy" }));

    const { system } = lastCall();
    expect(system).toContain("SUPPLEMENTARY PRODUCT CONTEXT");
    expect(system).toContain("CocoLash Kit - Daisy");
    expect(system).toContain("- Closure: magnetic");
    expect(system).toMatch(/If the images contradict the database, trust the images/);
  });

  it("expresses an absent feature by omission, never as a negation", async () => {
    replyOnce("prompt");
    // Jasmine is a plain tray: magneticClosure === false.
    await generateSeedanceVisionPrompt(input({ productSku: "jasmine" }));

    const { system } = lastCall();
    expect(system).toContain("Jasmine");
    expect(system).not.toContain("NO — never mention magnetic");
    expect(system).not.toMatch(/- Closure: magnetic/);
  });

  it("sends no database block at all when no SKU is supplied", async () => {
    replyOnce("prompt");
    await generateSeedanceVisionPrompt(input());
    expect(lastCall().system).not.toContain("SUPPLEMENTARY PRODUCT CONTEXT");
  });
});

// ── 5. Step 3 sends sku + all influencers + facts ────────────

describe("Step 3 sends the Director everything it has", () => {
  it("sends every influencer image, not just the scalar", () => {
    expect(STEP3_SOURCE).toContain(
      "...(state.ugcInfluencerImageUrls?.length\n            ? { influencerImageUrls: state.ugcInfluencerImageUrls }\n            : {}),"
    );
  });

  it("sends productSku, defensively skipping the wizard's empty default", () => {
    expect(STEP3_SOURCE).toContain(
      "...(state.productSku?.trim()\n            ? { productSku: state.productSku.trim() }\n            : {}),"
    );
  });

  it("sends the cached product facts the script was grounded in", () => {
    expect(STEP3_SOURCE).toContain(
      "{ productFacts: formatProductFactsForPrompt(state.productFacts) }"
    );
  });

  it("shows the user what the audit removed", () => {
    expect(STEP3_SOURCE).toContain(
      "setScriptAudit(Array.isArray(data.scriptAudit) ? data.scriptAudit : []);"
    );
    expect(STEP3_SOURCE).toContain("{scriptAudit.length > 0 && (");
  });
});

// ── 6. max_tokens + truncation ───────────────────────────────

describe("a truncated completion is an error, not a prompt", () => {
  it("asks for 2048 completion tokens", async () => {
    replyOnce("prompt");
    await generateSeedanceVisionPrompt(input());
    expect(VISION_DIRECTOR_MAX_TOKENS).toBe(2048);
    expect(lastCall().args.max_tokens).toBe(2048);
  });

  it.each(["length", "LENGTH", "max_tokens", "MAX_TOKENS", "max-tokens"])(
    "raises TRUNCATED_RESPONSE on finish_reason=%s",
    async (reason) => {
      replyOnce("Using @influencer_image1 she holds the kit and then", reason);
      await expect(generateSeedanceVisionPrompt(input())).rejects.toMatchObject({
        name: "VisionDirectorError",
        code: "TRUNCATED_RESPONSE",
      });
    }
  );

  it("classifies finish reasons without guessing", () => {
    expect(isTruncatedFinishReason("length")).toBe(true);
    expect(isTruncatedFinishReason("MAX_TOKENS")).toBe(true);
    expect(isTruncatedFinishReason("stop")).toBe(false);
    expect(isTruncatedFinishReason("tool_calls")).toBe(false);
    expect(isTruncatedFinishReason(undefined)).toBe(false);
    expect(isTruncatedFinishReason(null)).toBe(false);
  });

  it("still returns a complete prompt on a normal stop", async () => {
    replyOnce("Using @influencer_image1 @product_image1 she holds the kit.", "stop");
    const result = await generateSeedanceVisionPrompt(input());
    expect(result.prompt).toContain("@product_image1");
    expect(result.diagnostics.systemPromptId).toBe(SEEDANCE_VISION_DIRECTOR_PROMPT_ID);
  });
});

// ── 7. The audit never reaches Seedance ──────────────────────

describe("splitPromptAndAudit keeps the audit out of the prompt", () => {
  it("splits the prompt from the audit block", () => {
    const { prompt, scriptAudit } = splitPromptAndAudit(
      [
        "Using @influencer_image1 @product_image1 she opens the tan kit box.",
        "",
        "---SCRIPT AUDIT---",
        '- dropped "glass cover" — no glass appears in any image',
        "- reworded \"glass\" to \"clear\" on the lash case line",
      ].join("\n")
    );

    expect(prompt).toBe(
      "Using @influencer_image1 @product_image1 she opens the tan kit box."
    );
    expect(prompt).not.toMatch(/glass cover/);
    expect(scriptAudit).toEqual([
      'dropped "glass cover" — no glass appears in any image',
      'reworded "glass" to "clear" on the lash case line',
    ]);
  });

  it("returns an empty audit when the script was clean", () => {
    const { prompt, scriptAudit } = splitPromptAndAudit("A clean prompt.");
    expect(prompt).toBe("A clean prompt.");
    expect(scriptAudit).toEqual([]);
  });

  it.each(["none", "None.", "N/A", "no changes"])(
    "treats %s as a clean audit",
    (line) => {
      expect(
        splitPromptAndAudit(`Prompt text.\n---SCRIPT AUDIT---\n- ${line}`).scriptAudit
      ).toEqual([]);
    }
  );

  it("surfaces the audit on the director output", async () => {
    replyOnce(
      'Prompt body @product_image1.\n---SCRIPT AUDIT---\n- dropped "glass cover"'
    );
    const result = await generateSeedanceVisionPrompt(input());
    expect(result.prompt).toBe("Prompt body @product_image1.");
    expect(result.scriptAudit).toEqual(['dropped "glass cover"']);
  });

  it("refuses a reply that is nothing but an audit", async () => {
    replyOnce("---SCRIPT AUDIT---\n- dropped everything");
    await expect(generateSeedanceVisionPrompt(input())).rejects.toBeInstanceOf(
      VisionDirectorError
    );
  });
});

// ── 8. Regeneration varies the scene, not the product ────────

describe("regeneration keeps the honesty rules constant", () => {
  async function run(variation: boolean) {
    replyOnce("prompt");
    await generateSeedanceVisionPrompt(
      input({
        variationHint: variation ? "Give me a fresh take." : undefined,
      })
    );
    return lastCall();
  }

  it("uses the identical system prompt, hotter only on regeneration", async () => {
    const first = await run(false);
    const second = await run(true);

    // F6 (06-QUALITY-PASS.md) — deliberately changed: the first run used to
    // omit temperature entirely and inherit the provider default (≈1.0) for the
    // one call whose job is describing images accurately.
    expect(first.args.temperature).toBe(0.35);
    expect(second.args.temperature).toBe(0.9);
    expect(second.system).toBe(first.system);
  });

  it("asks for a different scene but forbids new product props", async () => {
    const { user } = await run(true);
    expect(user).toMatch(/Change the setting, location, time of day, background props/);
    expect(user).toMatch(/The honesty rules do not relax for a variation/);
    expect(user).toMatch(/do NOT invent a new product, a new package, a new product feature/);
    expect(user).toMatch(/still reference every @product_image token/);
  });

  it("no longer asks for new 'props' without qualification", () => {
    expect(DIRECTOR_SOURCE).not.toContain(
      "change the setting, location, time of day, props, framing"
    );
  });
});

// ── 9. The prompt is visible in /admin/prompts ───────────────

describe("the vision system prompt is registered", () => {
  it("appears in PROMPT_REGISTRY under the id the diagnostics report", () => {
    const entry = PROMPT_REGISTRY.find(
      (p) => p.id === SEEDANCE_VISION_DIRECTOR_PROMPT_ID
    );
    expect(entry).toBeDefined();
    expect(entry!.text).toBe(SEEDANCE_VISION_DIRECTOR_PROMPT);
    expect(entry!.text.length).toBeGreaterThan(500);
    expect(entry!.surface).toContain("/api/seedance/director-vision");
    expect(entry!.model).toBe("anthropic/claude-opus-4.7");
  });

  it("keeps every registry id unique", () => {
    const ids = PROMPT_REGISTRY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("registers the same prompt family the director actually sends", async () => {
    replyOnce("prompt");
    await generateSeedanceVisionPrompt(input({ productImageUrls: images(3) }));
    // The live prompt is staging-aware (product-showcase resolves to the
    // desk-propped rig); the registry shows the canonical selfie rendering.
    expect(lastCall().system).toBe(
      buildSeedanceVisionDirectorPrompt({
        influencerCount: 1,
        productImageCount: 3,
        stagingMode: "desk-propped",
      })
    );
    // With an explicit selfie staging the live prompt IS the registry prompt.
    replyOnce("prompt");
    await generateSeedanceVisionPrompt(
      input({ productImageUrls: images(3), stagingMode: "holding-selfie" })
    );
    expect(lastCall().system).toBe(SEEDANCE_VISION_DIRECTOR_PROMPT);
  });
});
