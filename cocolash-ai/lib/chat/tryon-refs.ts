/**
 * lib/chat/tryon-refs.ts — Curated try-on reference images per product.
 *
 * The chatbot try-on flow needs an image that shows ONLY the lash strip on
 * a clean background, so Gemini knows exactly what to apply to the user's
 * eyes. Storefront featured images are usually a model holding the box —
 * unusable for our purpose because Gemini sometimes copies the model's face
 * instead of the user's.
 *
 * These references live in `public/brand/tryon-refs/<style>.jpg` and are
 * served by Next.js as static assets. The keys are the short style
 * keywords used by `lib/chat/product-context.ts`.
 *
 * If a product handle isn't in this map, the try-on falls back to the
 * Storefront featured image (legacy behaviour).
 */

const STYLE_TRYON_REF: Record<string, string> = {
  dahlia: "/brand/tryon-refs/dahlia.jpg",
  daisy: "/brand/tryon-refs/daisy.jpg",
  iris: "/brand/tryon-refs/iris.jpg",
  jasmine: "/brand/tryon-refs/jasmine.jpg",
  marigold: "/brand/tryon-refs/marigold.jpg",
  orchid: "/brand/tryon-refs/orchid.jpg",
  peony: "/brand/tryon-refs/peony.jpg",
  poppy: "/brand/tryon-refs/poppy.jpg",
  rose: "/brand/tryon-refs/rose.jpg",
  violet: "/brand/tryon-refs/violet.jpg",
};

/**
 * Resolve a Shopify product handle (e.g. "dahlia-lash-extensions") to the
 * site-relative path of its curated try-on reference image, or null if no
 * curated ref exists. The first path segment of the handle is matched
 * against the known style keywords.
 *
 * The path is intentionally relative (e.g. "/brand/tryon-refs/dahlia.jpg")
 * so server-side callers can read it directly from disk via `getTryOnRefBuffer`,
 * avoiding a loopback HTTP fetch that would couple the chatbot to the
 * dev-server's port.
 */
export function getTryOnRefUrl(productHandle: string): string | null {
  const lower = productHandle.toLowerCase();
  for (const [style, path] of Object.entries(STYLE_TRYON_REF)) {
    if (lower.startsWith(style)) return path;
  }
  return null;
}

export function listKnownStyles(): string[] {
  return Object.keys(STYLE_TRYON_REF);
}

/**
 * Server-only helper: read a curated try-on reference straight off disk and
 * return raw bytes + mime type. Throws if the path is outside the known set
 * (defense in depth against path traversal).
 */
export async function readTryOnRefFromDisk(
  refPath: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!Object.values(STYLE_TRYON_REF).includes(refPath)) return null;
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const absolutePath = join(process.cwd(), "public", refPath.replace(/^\//, ""));
  const buffer = await readFile(absolutePath);
  const mimeType = refPath.endsWith(".png")
    ? "image/png"
    : refPath.endsWith(".webp")
    ? "image/webp"
    : "image/jpeg";
  return { buffer, mimeType };
}
