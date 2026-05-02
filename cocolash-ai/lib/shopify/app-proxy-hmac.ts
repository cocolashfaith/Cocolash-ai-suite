/**
 * lib/shopify/app-proxy-hmac.ts — verifier for Shopify App Proxy
 * signed query strings.
 *
 * App Proxy signs the QUERY STRING (not the body): the signature is
 * HMAC-SHA256-hex of the sorted, joined non-`signature` parameters,
 * keyed by the Shopify app's API secret. Multi-valued params are joined
 * with commas. Format: `key1=val1,val2&key2=val&...`. NO URL-encoding.
 *
 * This is a *different* scheme from webhook HMAC (which signs the raw
 * body and uses base64). We deliberately keep them in separate files
 * so future readers don't conflate them.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface ProxyVerifyResult {
  ok: boolean;
  reason?: "missing_signature" | "missing_secret" | "length_mismatch" | "signature_mismatch";
}

export function verifyAppProxySignature(
  url: string | URL,
  secret: string | undefined
): ProxyVerifyResult {
  if (!secret) return { ok: false, reason: "missing_secret" };

  const u = typeof url === "string" ? new URL(url, "https://placeholder.invalid") : url;
  const params = u.searchParams;
  const provided = params.get("signature");
  if (!provided) return { ok: false, reason: "missing_signature" };

  // Build the canonical message: sort keys, join multi-values with commas,
  // omit the `signature` itself, no URL encoding.
  const grouped = new Map<string, string[]>();
  for (const [k, v] of params.entries()) {
    if (k === "signature") continue;
    const arr = grouped.get(k) ?? [];
    arr.push(v);
    grouped.set(k, arr);
  }
  const sortedKeys = [...grouped.keys()].sort();
  const message = sortedKeys
    .map((k) => `${k}=${(grouped.get(k) ?? []).join(",")}`)
    .join("");

  const expected = createHmac("sha256", secret).update(message).digest("hex");
  const e = Buffer.from(expected);
  const p = Buffer.from(provided);
  if (e.length !== p.length) return { ok: false, reason: "length_mismatch" };
  if (!timingSafeEqual(e, p)) return { ok: false, reason: "signature_mismatch" };
  return { ok: true };
}
