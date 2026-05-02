/**
 * lib/shopify/hmac.ts — HMAC-SHA256 signature verification for Shopify
 * webhooks. Designed to *correct* the pattern flagged in CONCERNS.md
 * (Seedance webhook accepts secret in URL query): we read the signature
 * from the standard `X-Shopify-Hmac-Sha256` header only, and never from
 * URL query strings. Comparison uses crypto.timingSafeEqual.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const HEADER_NAME = "x-shopify-hmac-sha256";

export interface HmacVerifyResult {
  ok: boolean;
  reason?: "missing_header" | "missing_secret" | "length_mismatch" | "signature_mismatch";
}

/**
 * Verify a Shopify webhook payload. `rawBody` MUST be the exact bytes
 * Shopify sent (no JSON parse round-trip), since HMAC is computed over the
 * raw body. The returned result carries the failure reason for logging.
 */
export function verifyShopifyHmac(opts: {
  rawBody: string | Uint8Array;
  headers: Headers | Record<string, string | undefined>;
  secret: string | undefined;
}): HmacVerifyResult {
  const sig = headerValue(opts.headers, HEADER_NAME);
  if (!sig) return { ok: false, reason: "missing_header" };
  if (!opts.secret) return { ok: false, reason: "missing_secret" };

  const computed = createHmac("sha256", opts.secret)
    .update(typeof opts.rawBody === "string" ? Buffer.from(opts.rawBody, "utf-8") : Buffer.from(opts.rawBody))
    .digest("base64");

  const expected = Buffer.from(computed);
  const provided = Buffer.from(sig);
  if (expected.length !== provided.length) return { ok: false, reason: "length_mismatch" };
  if (!timingSafeEqual(expected, provided)) return { ok: false, reason: "signature_mismatch" };
  return { ok: true };
}

function headerValue(
  headers: Headers | Record<string, string | undefined>,
  name: string
): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const rec = headers as Record<string, string | undefined>;
  return rec[name] ?? rec[name.toLowerCase()] ?? null;
}
