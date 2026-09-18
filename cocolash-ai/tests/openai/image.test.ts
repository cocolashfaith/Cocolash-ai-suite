/**
 * GPT Image 2.5 composed-avatar engine (2026-09-17). The route uses OpenAI
 * whenever OPENAI_API_KEY is configured and keeps Gemini as the missing-key
 * fallback — asserted against both the lib helpers and the route source.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_QUALITY,
  buildOpenAIImagePayload,
  openAISizeForAspect,
} from "@/lib/openai/image";

const ROOT = resolve(__dirname, "../..");
const routeSource = readFileSync(
  resolve(ROOT, "app/api/seedance/generate-ugc-image/route.ts"),
  "utf8"
);

describe("openAISizeForAspect", () => {
  it("renders TRUE aspect ratios, divisible by 16", () => {
    expect(openAISizeForAspect("9:16")).toBe("1152x2048");
    expect(openAISizeForAspect("16:9")).toBe("2048x1152");
    expect(openAISizeForAspect("1:1")).toBe("1024x1024");
    for (const size of ["1152x2048", "2048x1152", "1024x1024"]) {
      const [w, h] = size.split("x").map(Number);
      expect(w % 16).toBe(0);
      expect(h % 16).toBe(0);
    }
  });
});

describe("buildOpenAIImagePayload", () => {
  it("uses /images/generations when there are no reference images", () => {
    const { endpoint, body } = buildOpenAIImagePayload({
      prompt: "p",
      aspect: "9:16",
    });
    expect(endpoint).toContain("/images/generations");
    expect("images" in body).toBe(false);
  });

  it("uses /images/edits with {image_url} objects when references exist", () => {
    const { endpoint, body } = buildOpenAIImagePayload({
      prompt: "p",
      aspect: "9:16",
      referenceImageUrls: ["https://a/1.png", "https://a/2.png"],
    });
    expect(endpoint).toContain("/images/edits");
    expect(body.images).toEqual([
      { image_url: "https://a/1.png" },
      { image_url: "https://a/2.png" },
    ]);
  });

  it("defaults to gpt-image-2.5-sunburst at xhigh quality", () => {
    // Sunburst won the same-inputs head-to-head on the kit box (flare
    // drifted to a kraft mailer); env-overridable via OPENAI_IMAGE_MODEL.
    expect(OPENAI_IMAGE_MODEL).toBe("gpt-image-2.5-sunburst");
    expect(OPENAI_IMAGE_QUALITY).toBe("xhigh");
    const { body } = buildOpenAIImagePayload({ prompt: "p", aspect: "1:1" });
    expect(body.model).toBe("gpt-image-2.5-sunburst");
    expect(body.quality).toBe("xhigh");
  });

  it("never sends input_fidelity — the 2.5 models reject it", () => {
    const { body } = buildOpenAIImagePayload({
      prompt: "p",
      aspect: "9:16",
      referenceImageUrls: ["https://a/1.png"],
    });
    expect("input_fidelity" in body).toBe(false);
  });
});

describe("route engine selection", () => {
  it("routes to OpenAI when configured, Gemini only as missing-key fallback", () => {
    expect(routeSource).toContain("openAIImageConfigured()");
    expect(routeSource).toContain("generateOpenAIImage({");
    expect(routeSource).toContain("Gemini fallback");
  });

  it("passes reference URLs straight through (no downloads on the OpenAI path)", () => {
    expect(routeSource).toContain("referenceImageUrls: productImageUrls");
  });

  it("sends every selected product image up to the API max of 16", () => {
    expect(routeSource).toContain("MAX_COMPOSE_PRODUCT_REFS = 16");
  });
});
