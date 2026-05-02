/**
 * Shopify App Proxy entry route.
 *
 * Shopify forwards `<store>/apps/cocolash-chat/<path>` to
 * `<deployed-app>/api/shopify/proxy/<path>`, signing the request via a
 * `signature` query parameter. We verify the HMAC, extract
 * `logged_in_customer_id` (Shopify auto-injects when known), and proxy
 * the request internally to the matching /api/chat* route.
 */

import { NextRequest } from "next/server";
import { verifyAppProxySignature } from "@/lib/shopify/app-proxy-hmac";

export const runtime = "nodejs";
export const maxDuration = 60;

const ROUTE_MAP: Record<string, string> = {
  chat: "/api/chat",
  "chat/lead": "/api/chat/lead",
  "chat/tryon": "/api/chat/tryon",
  "chat/tryon/upload": "/api/chat/tryon/upload",
  config: "/api/chat/config",
};

function originBase(req: NextRequest): string {
  // Use the Vercel deployment URL when available; falls back to localhost.
  const url = req.nextUrl;
  return `${url.protocol}//${url.host}`;
}

async function handle(req: NextRequest, params: { path: string[] }): Promise<Response> {
  if (!verifyAppProxySignature(req.url, process.env.SHOPIFY_APP_API_SECRET).ok) {
    return new Response(JSON.stringify({ error: "invalid_proxy_signature" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const path = params.path.join("/");
  const target = ROUTE_MAP[path];
  if (!target) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const customerId = req.nextUrl.searchParams.get("logged_in_customer_id");
  const shopDomain = req.nextUrl.searchParams.get("shop") ?? undefined;

  // Build internal forward URL (preserving query for GETs).
  const internalUrl = new URL(target, originBase(req));

  const headers = new Headers(req.headers);
  // Strip Shopify-only proxy headers — they shouldn't reach our app routes.
  headers.delete("x-shopify-shop-domain");
  headers.delete("x-shopify-proxy-signature");
  if (shopDomain) headers.set("x-shop-domain", shopDomain);

  // Inject customerId into the body for chat/lead/tryon endpoints.
  let body: BodyInit | undefined;
  if (req.method === "POST") {
    const original = await req.json().catch(() => ({}));
    const augmented = customerId
      ? { ...original, customerId }
      : original;
    body = JSON.stringify(augmented);
    headers.set("content-type", "application/json");
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    body,
  };

  const res = await fetch(internalUrl, init);
  // Stream the response back to Shopify (preserving headers).
  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(req, await ctx.params);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(req, await ctx.params);
}
