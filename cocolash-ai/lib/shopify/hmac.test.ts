import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyShopifyHmac } from "./hmac";

const SECRET = "shpss_test_secret";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("base64");
}

describe("verifyShopifyHmac", () => {
  it("accepts a valid signature", () => {
    const body = '{"id":1,"handle":"violet-subtle-charm"}';
    const sig = sign(body);
    const r = verifyShopifyHmac({
      rawBody: body,
      headers: new Headers({ "x-shopify-hmac-sha256": sig }),
      secret: SECRET,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects when the header is missing", () => {
    const r = verifyShopifyHmac({
      rawBody: "{}",
      headers: new Headers({}),
      secret: SECRET,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_header");
  });

  it("rejects when the secret is not configured", () => {
    const r = verifyShopifyHmac({
      rawBody: "{}",
      headers: new Headers({ "x-shopify-hmac-sha256": "abc" }),
      secret: undefined,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_secret");
  });

  it("rejects a tampered body", () => {
    const sig = sign('{"id":1}');
    const r = verifyShopifyHmac({
      rawBody: '{"id":2}', // mutated
      headers: new Headers({ "x-shopify-hmac-sha256": sig }),
      secret: SECRET,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signature_mismatch");
  });

  it("rejects a wrong-length signature", () => {
    const r = verifyShopifyHmac({
      rawBody: "{}",
      headers: new Headers({ "x-shopify-hmac-sha256": "tooshort" }),
      secret: SECRET,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("length_mismatch");
  });

  it("supports a record-style headers map", () => {
    const body = "hello";
    const sig = sign(body);
    const r = verifyShopifyHmac({
      rawBody: body,
      headers: { "x-shopify-hmac-sha256": sig },
      secret: SECRET,
    });
    expect(r.ok).toBe(true);
  });
});
