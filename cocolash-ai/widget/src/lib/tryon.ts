/**
 * widget/src/lib/tryon.ts — client-side virtual try-on flow.
 *
 *   1. POST the selfie file as multipart to /api/chat/tryon/upload
 *      (consent must be confirmed by the caller before this is invoked).
 *   2. With the returned signed URL, POST to /api/chat/tryon to run the
 *      composition. Returns the final image URL.
 */

export interface TryOnConfig {
  apiBaseUrl: string;
  sessionId: string;
}

export async function uploadSelfie(
  cfg: TryOnConfig,
  file: File
): Promise<{ url: string; expiresAt: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("session", cfg.sessionId);
  form.append("consent", "true");
  const res = await fetch(`${cfg.apiBaseUrl.replace(/\/$/, "")}/api/chat/tryon/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`upload failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as { url: string; expiresAt: string };
}

export async function runTryOn(
  cfg: TryOnConfig,
  productHandle: string,
  selfieUrl: string
): Promise<{ composedUrl: string; messageId: string }> {
  const res = await fetch(`${cfg.apiBaseUrl.replace(/\/$/, "")}/api/chat/tryon`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: cfg.sessionId, productHandle, selfieUrl }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`tryon failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as { composedUrl: string; messageId: string };
}
