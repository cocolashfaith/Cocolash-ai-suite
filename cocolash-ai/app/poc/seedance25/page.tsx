"use client";

import { useEffect, useRef, useState } from "react";

// Pre-attached demo inputs (real CocoLash assets).
const INFLUENCER =
  "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/generated-images/cocolash/1f59685f-4fad-4bd0-809d-98f89dd0d715-studio-avatar.jpg";
const PRODUCT =
  "https://cdn.shopify.com/s/files/1/0660/8646/9831/files/dahlia-915557.jpg?v=1768316695";

type Phase = "idle" | "starting" | "rendering" | "done" | "error";

export default function Seedance25Poc() {
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [phase, setPhase] = useState<Phase>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  async function generate() {
    setPhase("starting");
    setError(null);
    setVideoUrl(null);
    setElapsed(0);
    try {
      const res = await fetch("/api/poc/seedance25", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution, duration: "6" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.error || "Failed to start");
      const { requestId, token } = body as { requestId: string; token: string };

      setPhase("rendering");
      tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch(
            `/api/poc/seedance25?requestId=${encodeURIComponent(requestId)}&token=${encodeURIComponent(token)}`
          );
          const sj = await s.json();
          if (sj.status === "COMPLETED" && sj.videoUrl) {
            stop();
            setVideoUrl(sj.videoUrl as string);
            setPhase("done");
          } else if (sj.status === "FAILED") {
            stop();
            setError(sj.error || "Generation failed");
            setPhase("error");
          }
        } catch {
          /* keep polling */
        }
      }, 12000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("error");
    }
  }

  function stop() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }

  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const busy = phase === "starting" || phase === "rendering";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-coco-brown px-3 py-1 text-xs font-semibold text-coco-cream">
          POC · Seedance 2.5
        </span>
        <h1 className="mt-3 text-3xl font-bold text-coco-brown">UGC video — new model preview</h1>
        <p className="mt-1 text-sm text-coco-brown-medium">
          One influencer image + one product image → a UGC video on the new Seedance 2.5 engine.
          Separate from the live product, which still runs 2.0.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <figure className="overflow-hidden rounded-2xl border border-coco-pink-soft bg-white shadow-sm">
          <img src={INFLUENCER} alt="Influencer" className="aspect-[3/4] w-full object-cover" />
          <figcaption className="px-3 py-2 text-xs font-medium text-coco-brown-medium">
            Influencer · from your gallery
          </figcaption>
        </figure>
        <figure className="overflow-hidden rounded-2xl border border-coco-pink-soft bg-white shadow-sm">
          <img src={PRODUCT} alt="Dahlia product" className="aspect-[3/4] w-full object-cover" />
          <figcaption className="px-3 py-2 text-xs font-medium text-coco-brown-medium">
            Product · Dahlia (live store)
          </figcaption>
        </figure>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-coco-pink-soft bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-coco-brown-medium">
            Quality
          </span>
          {(["720p", "1080p"] as const).map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => setResolution(r)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                resolution === r
                  ? "bg-coco-brown text-coco-cream"
                  : "border border-coco-pink-dark/40 text-coco-brown hover:bg-coco-pink-soft",
              ].join(" ")}
            >
              {r === "1080p" ? "1080p (best)" : "720p"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-coco-golden-dark px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-coco-golden disabled:opacity-60"
        >
          {busy ? "Generating…" : "Generate video"}
        </button>
      </div>

      {phase === "rendering" ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-coco-pink-soft bg-coco-beige/60 px-4 py-3 text-sm text-coco-brown">
          <span className="size-2 animate-pulse rounded-full bg-coco-golden-dark" />
          Rendering on Seedance 2.5… {mmss} elapsed. This usually takes 2–10 minutes — keep this
          tab open.
        </div>
      ) : null}

      {phase === "error" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {phase === "done" && videoUrl ? (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-coco-brown">Result · Seedance 2.5</h2>
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            playsInline
            className="mx-auto max-h-[70vh] rounded-2xl border border-coco-pink-soft shadow-md"
          />
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm text-coco-golden-dark underline"
          >
            Open / download the video
          </a>
        </div>
      ) : null}
    </div>
  );
}
