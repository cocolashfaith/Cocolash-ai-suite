import { useCallback, useRef, useState } from "preact/hooks";
import { uploadSelfie, runTryOn, type TryOnConfig } from "../lib/tryon";
import { TryOnProgress } from "./TryOnProgress";

type Status = "consent" | "selecting" | "uploading" | "composing" | "done" | "error";

interface TryOnDialogProps {
  cfg: TryOnConfig;
  productHandle: string;
  productTitle: string;
  onClose: () => void;
  onResult: (composedUrl: string) => void;
}

/**
 * Translate a raw thrown error into something a shopper can act on. A bare
 * "Failed to fetch" (the browser's TypeError when a request never completes —
 * a dropped connection, a timeout, or a momentary rate-limit between rapid
 * try-ons) is meaningless to a customer, so we map network-class failures to a
 * calm "try again" message and only surface specific server messages otherwise.
 */
function friendlyTryOnError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/failed to fetch|networkerror|load failed|aborted|timeout/i.test(raw)) {
    return "The connection dropped for a second — your photo's fine. Tap Try again.";
  }
  return raw || "That try-on didn't go through. Tap Try again.";
}

export function TryOnDialog({ cfg, productHandle, productTitle, onClose, onResult }: TryOnDialogProps) {
  const [status, setStatus] = useState<Status>("consent");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [composedUrl, setComposedUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = useCallback(
    async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      setStatus("uploading");
      setErrorMessage(null);
      try {
        const { url } = await uploadSelfie(cfg, file);
        setStatus("composing");
        const { composedUrl: result } = await runTryOn(cfg, productHandle, url);
        setComposedUrl(result);
        onResult(result);
        setStatus("done");
      } catch (err) {
        setErrorMessage(friendlyTryOnError(err));
        setStatus("error");
      }
    },
    [cfg, productHandle, onResult]
  );

  return (
    <div class="tryon-overlay" role="dialog" aria-modal="true">
      <div class="tryon-dialog">
        <button type="button" class="tryon-close" onClick={onClose} aria-label="Close">×</button>
        {status === "consent" ? (
          <>
            <h3 class="tryon-title">See {productTitle} on you?</h3>
            <p class="tryon-body">
              Upload or capture a selfie and Coco will pop {productTitle} on a quick preview.
              Your photo is sent to our AI for a single use, kept for 24 hours, then deleted.
            </p>
            <div class="tryon-buttons">
              <button
                type="button"
                class="tryon-btn tryon-btn--primary"
                onClick={() => {
                  setStatus("selecting");
                  setTimeout(() => fileInput.current?.click(), 0);
                }}
              >
                Yes, I'm in
              </button>
              <button type="button" class="tryon-btn tryon-btn--secondary" onClick={onClose}>
                Maybe later
              </button>
            </div>
          </>
        ) : null}
        {status === "selecting" ? (
          <>
            <h3 class="tryon-title">Putting {productTitle} on you…</h3>
            <p class="tryon-body">Pick a photo or capture a selfie.</p>
            <div class="tryon-spinner" aria-hidden="true" />
          </>
        ) : null}
        {status === "uploading" || status === "composing" ? (
          <>
            <h3 class="tryon-title">Putting {productTitle} on you…</h3>
            <TryOnProgress phase={status} productTitle={productTitle} />
          </>
        ) : null}
        {status === "error" ? (
          <>
            <h3 class="tryon-title">That didn't work</h3>
            <p class="tryon-body">{errorMessage ?? "Please try again."}</p>
            <div class="tryon-buttons">
              <button type="button" class="tryon-btn tryon-btn--primary" onClick={() => setStatus("consent")}>
                Try again
              </button>
            </div>
          </>
        ) : null}
        {status === "done" ? (
          <>
            <h3 class="tryon-title">Here's {productTitle} on you 💛</h3>
            {composedUrl ? (
              <div class="tryon-result">
                <img src={composedUrl} alt={`${productTitle} virtual try-on preview`} />
              </div>
            ) : null}
            <p class="tryon-body">Looking good! We've saved this to your chat too.</p>
            <div class="tryon-buttons">
              <button type="button" class="tryon-btn tryon-btn--primary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="user"
          style="display:none"
          onChange={onFile}
        />
      </div>
    </div>
  );
}
