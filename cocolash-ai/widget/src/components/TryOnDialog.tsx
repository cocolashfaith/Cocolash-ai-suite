import { useCallback, useRef, useState } from "preact/hooks";
import { uploadSelfie, runTryOn, type TryOnConfig } from "../lib/tryon";

type Status = "consent" | "selecting" | "uploading" | "composing" | "done" | "error";

interface TryOnDialogProps {
  cfg: TryOnConfig;
  productHandle: string;
  productTitle: string;
  onClose: () => void;
  onResult: (composedUrl: string) => void;
}

export function TryOnDialog({ cfg, productHandle, productTitle, onClose, onResult }: TryOnDialogProps) {
  const [status, setStatus] = useState<Status>("consent");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
        const { composedUrl } = await runTryOn(cfg, productHandle, url);
        onResult(composedUrl);
        setStatus("done");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Try-on failed.");
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
        {status === "selecting" || status === "uploading" || status === "composing" ? (
          <>
            <h3 class="tryon-title">Putting {productTitle} on you…</h3>
            <p class="tryon-body">
              {status === "selecting"
                ? "Pick a photo or capture a selfie."
                : status === "uploading"
                  ? "Sending your photo securely…"
                  : "Coco's working her magic. This can take 10 to 30 seconds."}
            </p>
            <div class="tryon-spinner" aria-hidden="true" />
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
            <h3 class="tryon-title">Done!</h3>
            <p class="tryon-body">Your preview is in the chat. Looking good!</p>
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
