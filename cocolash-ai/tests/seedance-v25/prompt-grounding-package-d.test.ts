import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/seedance/generate/route";
import { createAdminClient } from "@/lib/supabase/server";
import { validateAndCorrectPrompt } from "@/lib/brand/prompt-validator";
import {
  PRODUCT_CATEGORY_DIRECTIVE,
  applyProductCategoryGuard,
  mentionsProductCategory,
} from "@/lib/seedance/prompt-planner";
import { applyProductGuard, applyPromptValidation } from "@/lib/seedance/v25/generate";
import { resetSeedanceSubmitRateLimit } from "@/lib/seedance/submit-rate-limit";
import type { Seedance25Request } from "@/lib/seedance/v25/types";

/**
 * Package D — the server must never invent a lash FORMAT.
 *
 * Root cause #6 of docs/seedance-2.5/05-GROUNDING-FIX.md: after the user
 * approved their prompt, the server silently prepended "CocoLash false-lash
 * extension strips … a small cluster lash strip in branded packaging" to any
 * prompt that did not mention lashes. CocoLash sells CLUSTER lashes, and the
 * client's complaint is that clusters render as strips.
 *
 * Contract enforced here:
 *   - a prompt that already names the product is left byte-identical;
 *   - a prompt that does not gets a CATEGORY anchor only — no format, no
 *     packaging, no negations;
 *   - the product-truth validator runs on the FINAL prompt, and its corrected
 *     text is what reaches /queue and `seedance_prompt`;
 *   - corrections are returned to the caller and persisted on the row;
 *   - /queue is still POSTed exactly once and never retried.
 *
 * Enhancor is never called: `global.fetch` is mocked in every route test.
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/seedance/reference-resolver");
vi.mock("@/lib/brand/prompt-validator", () => ({
  validateAndCorrectPrompt: vi.fn((input: { prompt: string }) => ({
    prompt: input.prompt,
    corrections: [],
  })),
}));

const VIDEO_ID = "44444444-4444-4444-4444-444444444444";
const PRODUCT = "https://cdn.shopify.com/s/files/1/0660/dahlia-915557.jpg";
const INFLUENCER = "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/x.jpg";
const REPO_ROOT = join(__dirname, "..", "..");

const realFetch = global.fetch;

interface Recorded {
  table: string;
  row?: Record<string, unknown>;
}

function makeSupabase(): { client: unknown; inserts: Recorded[] } {
  const inserts: Recorded[] = [];

  const client = {
    from(table: string) {
      const state: { op?: "insert" | "update" } = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
        eq: () => chain,
        insert(row: Record<string, unknown>) {
          state.op = "insert";
          inserts.push({ table, row });
          return chain;
        },
        update() {
          state.op = "update";
          return chain;
        },
        single: async () =>
          state.op === "insert"
            ? { data: { id: VIDEO_ID }, error: null }
            : { data: null, error: null },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(onF, onR),
      };
      return chain;
    },
  };

  return { client, inserts };
}

interface QueueCall {
  url: string;
  body: Record<string, unknown>;
}

/** Enhancor costs real money — every route test goes through this mock. */
function mockQueueFetch(): { calls: QueueCall[] } {
  const calls: QueueCall[] = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : {},
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, requestId: "req-d" }),
      text: async () => JSON.stringify({ success: true, requestId: "req-d" }),
    } as Response;
  }) as unknown as typeof fetch;
  return { calls };
}

function post(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/seedance/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ugcBody(prompt: string, rest: Record<string, unknown> = {}) {
  return {
    engine: "2.5",
    request: {
      mode: "ugc",
      prompt,
      duration: 8,
      resolution: "720p",
      aspect_ratio: "9:16",
      products: [PRODUCT],
      influencers: [INFLUENCER],
    },
    ...rest,
  };
}

/** Words that assert a lash FORMAT or packaging — banned from server text. */
const FORMAT_ASSERTIONS = /strip|cluster|half[- ]?lash|packaging|magnetic|box|tray|band/i;

describe("Package D — the category anchor asserts no lash format", () => {
  it("adds nothing when the prompt already names the product", () => {
    const named = "She opens the CocoLash kit and smiles";
    expect(applyProductCategoryGuard(named)).toBe(named);
    expect(mentionsProductCategory(named)).toBe(true);
  });

  it("treats 'lashes' and 'eyelash' as naming the product", () => {
    for (const prompt of [
      "She applies the lashes to her upper lid",
      "Close-up of her eyelash line",
      "cocolash on the vanity",
    ]) {
      expect(applyProductCategoryGuard(prompt)).toBe(prompt);
    }
  });

  it("prepends a neutral anchor when the prompt names no product", () => {
    const bare = "She smiles at the camera holding the box";
    const guarded = applyProductCategoryGuard(bare);

    expect(guarded).not.toBe(bare);
    expect(guarded.endsWith(bare)).toBe(true);
    expect(guarded).toContain(PRODUCT_CATEGORY_DIRECTIVE);
  });

  it("never asserts a lash format, packaging, or a negation", () => {
    expect(PRODUCT_CATEGORY_DIRECTIVE).not.toMatch(FORMAT_ASSERTIONS);
    // G5: video models render the nouns inside a negation.
    expect(PRODUCT_CATEGORY_DIRECTIVE).not.toMatch(/\bNOT\b|\bno\b|\bnever\b|\bwithout\b/);
    expect(PRODUCT_CATEGORY_DIRECTIVE.toLowerCase()).toContain("cocolash");
  });

  it("is idempotent — guarding twice changes nothing", () => {
    const once = applyProductCategoryGuard("She smiles at the camera");
    expect(applyProductCategoryGuard(once)).toBe(once);
  });
});

describe("Package D — applyProductGuard (engine 2.5)", () => {
  const base = {
    mode: "ugc",
    prompt: "She smiles at the camera holding the box",
    duration: 8,
    resolution: "720p",
    aspect_ratio: "9:16",
    products: [PRODUCT],
  } as unknown as Seedance25Request;

  it("guards a ugc prompt that names no product", () => {
    const guarded = applyProductGuard(base);
    expect(guarded.prompt).toContain(PRODUCT_CATEGORY_DIRECTIVE);
    expect(guarded.prompt).not.toMatch(/strip/i);
  });

  it("leaves non-ugc modes untouched", () => {
    const edit = { ...base, mode: "edit" } as unknown as Seedance25Request;
    expect(applyProductGuard(edit)).toBe(edit);
  });

  it("returns the same object when the prompt already names the product", () => {
    const named = { ...base, prompt: "She holds the CocoLash lashes" } as Seedance25Request;
    expect(applyProductGuard(named)).toBe(named);
  });
});

describe("Package D — applyPromptValidation", () => {
  beforeEach(() => {
    vi.mocked(validateAndCorrectPrompt).mockReset();
    vi.mocked(validateAndCorrectPrompt).mockImplementation((input: { prompt: string }) => ({
      prompt: input.prompt,
      corrections: [],
    }));
  });

  it("passes the prompt, sku and resolved truth entry to the validator", () => {
    const request = { mode: "ugc", prompt: "She holds the lashes" } as Seedance25Request;
    applyPromptValidation(request, "violet");

    const call = vi.mocked(validateAndCorrectPrompt).mock.calls[0][0];
    expect(call.prompt).toBe("She holds the lashes");
    expect(call.sku).toBe("violet");
    expect(call.truth?.sku).toBe("violet");
    expect(call.truth?.lashType).toBe("clusters");
  });

  it("passes truth null for an unknown or absent sku", () => {
    const request = { mode: "ugc", prompt: "She holds the lashes" } as Seedance25Request;
    applyPromptValidation(request, null);
    expect(vi.mocked(validateAndCorrectPrompt).mock.calls[0][0].truth).toBeNull();

    applyPromptValidation(request, "not-a-real-sku");
    expect(vi.mocked(validateAndCorrectPrompt).mock.calls[1][0].truth).toBeNull();
  });

  it("returns the corrected prompt and the corrections", () => {
    vi.mocked(validateAndCorrectPrompt).mockReturnValue({
      prompt: "She lifts the clear plastic cover",
      corrections: [
        { claim: "glass cover", replacement: "clear plastic cover", reason: "no glass exists" },
      ],
    });

    const result = applyPromptValidation(
      { mode: "ugc", prompt: "She lifts the glass cover" } as Seedance25Request,
      null
    );

    expect(result.request.prompt).toBe("She lifts the clear plastic cover");
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].claim).toBe("glass cover");
  });

  it("validates every multi-frame segment and de-duplicates repeated claims", () => {
    vi.mocked(validateAndCorrectPrompt).mockImplementation((input: { prompt: string }) => ({
      prompt: input.prompt.replace(/glass/g, "clear plastic"),
      corrections: input.prompt.includes("glass")
        ? [{ claim: "glass cover", replacement: "clear plastic cover", reason: "no glass" }]
        : [],
    }));

    const result = applyPromptValidation(
      {
        mode: "multi_frame",
        multi_frame_prompts: [
          { prompt: "She opens the glass lid", duration: 4 },
          { prompt: "She closes the glass lid", duration: 4 },
        ],
      } as unknown as Seedance25Request,
      null
    );

    expect(result.request.multi_frame_prompts?.map((s) => s.prompt)).toEqual([
      "She opens the clear plastic lid",
      "She closes the clear plastic lid",
    ]);
    expect(result.corrections).toHaveLength(1);
  });

  it("returns the identical request object when nothing changed", () => {
    const request = { mode: "ugc", prompt: "She holds the lashes" } as Seedance25Request;
    const result = applyPromptValidation(request, null);
    expect(result.request).toBe(request);
    expect(result.corrections).toEqual([]);
  });
});

describe("Package D — POST /api/seedance/generate (2.5) wire contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSeedanceSubmitRateLimit();
    vi.mocked(validateAndCorrectPrompt).mockImplementation((input: { prompt: string }) => ({
      prompt: input.prompt,
      corrections: [],
    }));
    process.env.ENHANCOR_API_KEY = "test_enhancor_key";
    process.env.ENHANCOR_WEBHOOK_SECRET = "webhook-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
    delete process.env.ENHANCOR_API_KEY;
    delete process.env.ENHANCOR_WEBHOOK_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("never sends 'strip' when guarding a prompt that names no product", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const response = await POST(post(ugcBody("She smiles at the camera holding the box")));

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    const wirePrompt = String(calls[0].body.prompt);
    expect(wirePrompt).toContain(PRODUCT_CATEGORY_DIRECTIVE);
    expect(wirePrompt).not.toMatch(/strip/i);
    expect(wirePrompt).not.toMatch(/cluster/i);

    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(String(row.seedance_prompt)).toBe(wirePrompt);
    expect(String(row.seedance_prompt)).not.toMatch(/strip/i);
  });

  it("leaves an approved prompt that names the product byte-identical", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const approved = "She opens the CocoLash kit and applies the lashes, smiling";
    await POST(post(ugcBody(approved)));

    expect(calls).toHaveLength(1);
    expect(calls[0].body.prompt).toBe(approved);
    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(row.seedance_prompt).toBe(approved);
  });

  it("sends the VALIDATOR'S corrected prompt to /queue and stores it", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    const corrections = [
      {
        claim: "glass cover",
        replacement: "clear plastic cover",
        reason: "The lash case has a clear plastic inner cover; no glass exists on the product.",
      },
    ];
    vi.mocked(validateAndCorrectPrompt).mockReturnValue({
      prompt: "She lifts the clear plastic cover off the CocoLash lashes",
      corrections,
    });

    const response = await POST(
      post(ugcBody("She lifts the glass cover off the CocoLash lashes"))
    );
    const json = (await response.json()) as { corrections?: unknown };

    // The validator runs on the FINAL prompt, immediately before /queue.
    expect(calls).toHaveLength(1);
    expect(calls[0].body.prompt).toBe("She lifts the clear plastic cover off the CocoLash lashes");
    expect(String(calls[0].body.prompt)).not.toContain("glass");

    // …and the same text is what we persist as the prompt of record.
    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(row.seedance_prompt).toBe("She lifts the clear plastic cover off the CocoLash lashes");

    // …and the user is told what changed, on the response and on the row.
    expect(json.corrections).toEqual(corrections);
    const payload = row.request_payload as Record<string, unknown>;
    expect(payload.corrections).toEqual(corrections);
    expect(payload.prompt).toBe("She lifts the clear plastic cover off the CocoLash lashes");
  });

  it("returns an empty corrections array and omits the key when nothing changed", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch();

    const response = await POST(post(ugcBody("She holds the CocoLash lashes")));
    const json = (await response.json()) as { corrections?: unknown };

    expect(json.corrections).toEqual([]);
    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(row.request_payload as Record<string, unknown>).not.toHaveProperty("corrections");
  });

  it("forwards the selected sku so the validator can use product truth", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    mockQueueFetch();

    await POST(post(ugcBody("She holds the CocoLash lashes", { productSku: "violet" })));

    const call = vi.mocked(validateAndCorrectPrompt).mock.calls[0][0];
    expect(call.sku).toBe("violet");
    expect(call.truth?.lashType).toBe("clusters");
  });

  it("sends corrected multi-frame segments to /queue", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    vi.mocked(validateAndCorrectPrompt).mockImplementation((input: { prompt: string }) => ({
      prompt: input.prompt.replace(/glass/g, "clear plastic"),
      corrections: input.prompt.includes("glass")
        ? [{ claim: "glass lid", replacement: "clear plastic lid", reason: "no glass exists" }]
        : [],
    }));

    const response = await POST(
      post({
        engine: "2.5",
        request: {
          mode: "multi_frame",
          duration: -1,
          resolution: "720p",
          aspect_ratio: "9:16",
          images: [PRODUCT],
          multi_frame_prompts: [
            { prompt: "She opens the glass lid of the CocoLash case", duration: 4 },
            { prompt: "She applies the CocoLash lashes", duration: 4 },
          ],
        },
      })
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    const segments = calls[0].body.multi_frame_prompts as Array<{ prompt: string }>;
    expect(segments[0].prompt).toBe("She opens the clear plastic lid of the CocoLash case");
    expect(JSON.stringify(calls[0].body)).not.toContain("glass");

    const row = harness.inserts[0].row as Record<string, unknown>;
    expect(String(row.seedance_prompt)).toContain("clear plastic lid");
    expect(String(row.seedance_prompt)).not.toContain("glass");
  });

  it("POSTs /queue exactly once and never retries it", async () => {
    const harness = makeSupabase();
    vi.mocked(createAdminClient).mockResolvedValue(harness.client as never);
    const { calls } = mockQueueFetch();

    await POST(post(ugcBody("She smiles at the camera holding the box")));

    const queueCalls = calls.filter((c) => c.url.includes("/queue"));
    expect(queueCalls).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});

describe("Package D — no source path can assert a lash format", () => {
  /** Comments explain the bug and quote the old wording; code must not. */
  function codeOf(relativePath: string): string {
    return readFileSync(join(REPO_ROOT, relativePath), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
  }

  const OWNED = [
    "lib/seedance/v25/generate.ts",
    "app/api/seedance/generate/route.ts",
    "lib/seedance/prompt-planner.ts",
  ];

  it.each(OWNED)("%s contains no 'strip'/'cluster' product assertion", (file) => {
    const code = codeOf(file);
    expect(code).not.toMatch(/\bstrips?\b/i);
    expect(code).not.toMatch(/\bclusters?\b/i);
  });

  it("DEFAULT_PRODUCT_DESCRIPTION asserts no lash format or packaging", () => {
    const source = readFileSync(join(REPO_ROOT, "app/api/seedance/generate/route.ts"), "utf8");
    const match = source.match(/const DEFAULT_PRODUCT_DESCRIPTION\s*=\s*([\s\S]*?);\n/);
    expect(match).not.toBeNull();

    const literal = match![1];
    expect(literal.toLowerCase()).toContain("cocolash");
    expect(literal).not.toMatch(FORMAT_ASSERTIONS);
  });
});
