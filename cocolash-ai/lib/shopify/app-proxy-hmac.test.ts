import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyAppProxySignature } from "./app-proxy-hmac";

const SECRET = "shpss_proxy_test";

function sign(params: Record<string, string | string[]>): string {
  const grouped = new Map<string, string[]>();
  for (const [k, v] of Object.entries(params)) {
    grouped.set(k, Array.isArray(v) ? v : [v]);
  }
  const message = [...grouped.keys()]
    .sort()
    .map((k) => `${k}=${(grouped.get(k) ?? []).join(",")}`)
    .join("");
  return createHmac("sha256", SECRET).update(message).digest("hex");
}

function urlWith(params: Record<string, string | string[]>, signature: string): string {
  const u = new URL("https://example.test/apps/cocolash-chat/chat");
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x));
    else u.searchParams.set(k, v);
  }
  u.searchParams.set("signature", signature);
  return u.toString();
}

describe("verifyAppProxySignature", () => {
  it("accepts a valid signature", () => {
    const params = { shop: "cocolash.myshopify.com", path_prefix: "/apps/cocolash-chat", timestamp: "1700000000" };
    const sig = sign(params);
    expect(verifyAppProxySignature(urlWith(params, sig), SECRET).ok).toBe(true);
  });

  it("rejects missing signature", () => {
    const u = new URL("https://example.test/apps/cocolash-chat?shop=x");
    expect(verifyAppProxySignature(u, SECRET)).toEqual({
      ok: false,
      reason: "missing_signature",
    });
  });

  it("rejects missing secret", () => {
    const params = { shop: "x" };
    const sig = sign(params);
    expect(verifyAppProxySignature(urlWith(params, sig), undefined)).toEqual({
      ok: false,
      reason: "missing_secret",
    });
  });

  it("rejects a wrong-length signature", () => {
    const params = { shop: "x" };
    expect(verifyAppProxySignature(urlWith(params, "deadbeef"), SECRET)).toEqual({
      ok: false,
      reason: "length_mismatch",
    });
  });

  it("rejects a tampered param", () => {
    const params = { shop: "cocolash.myshopify.com", timestamp: "1700000000" };
    const sig = sign(params);
    // Tamper the shop after signing
    expect(verifyAppProxySignature(urlWith({ ...params, shop: "evil.shop" }, sig), SECRET).ok).toBe(false);
  });

  it("handles multi-valued query params (joined with commas)", () => {
    const params = { shop: "cocolash.myshopify.com", tags: ["a", "b"] };
    const sig = sign(params);
    expect(verifyAppProxySignature(urlWith(params, sig), SECRET).ok).toBe(true);
  });
});
