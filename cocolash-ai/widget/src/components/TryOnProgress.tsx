import { useEffect, useRef, useState } from "preact/hooks";

/**
 * TryOnProgress — a psychology-informed wait experience for the ~20–30s AI
 * try-on composition. We can't speed up the model without losing quality, so
 * instead we make the wait *feel* short and non-intimidating. Principles applied
 * (Maister's "Psychology of Waiting Lines"; Harrison et al. progress-bar study;
 * NN/g response-time guidance):
 *
 *  - Determinate, labelled, step-based progress (uncertain/unexplained waits
 *    feel longer) instead of a bare spinner.
 *  - Optimistic curve that starts ahead (~14%) and eases up, never stalling at
 *    the end (goal-gradient + "accelerate toward completion feels faster").
 *  - Occupied time: rotating, relevant tips + a skeleton preview of where the
 *    result will land, to set anticipation.
 *  - Explicit, honest time reassurance ("usually under 30s"); a calmer message
 *    if it overruns rather than a stuck bar.
 *  - Respects prefers-reduced-motion (no shimmer/rotation; discrete updates).
 */

interface TryOnProgressProps {
  phase: "uploading" | "composing";
  productTitle: string;
}

const STAGES: ReadonlyArray<{ until: number; label: string }> = [
  { until: 7, label: "Analyzing your eye shape" },
  { until: 15, label: "Matching {product} to your eyes" },
  { until: 24, label: "Rendering your look" },
  { until: Infinity, label: "Adding the finishing touches" },
];

const TIPS: ReadonlyArray<string> = [
  "Tip: pinch the band gently at your lash line for the most natural fit.",
  "Did you know? CocoLash bands are flexible cotton, not stiff plastic.",
  "Tip: warm the lashes between your fingers so they hug your eye shape.",
  "Tip: a thin line of clear adhesive lasts longer than a thick one.",
];

// upload counts as step 1, then one step per composing stage
const TOTAL_STEPS = STAGES.length + 1;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function TryOnProgress({ phase, productTitle }: TryOnProgressProps) {
  const [elapsed, setElapsed] = useState(0); // seconds since composing started
  const [tipIndex, setTipIndex] = useState(0);
  const startRef = useRef<number | null>(null);
  const reduced = prefersReducedMotion();

  // Tick elapsed time while composing.
  useEffect(() => {
    if (phase !== "composing") {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current != null) {
        setElapsed((Date.now() - startRef.current) / 1000);
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  // Rotate tips every 6s while composing (single static tip for reduced motion).
  useEffect(() => {
    if (phase !== "composing" || reduced) return;
    const id = setInterval(
      () => setTipIndex((i) => (i + 1) % TIPS.length),
      6000
    );
    return () => clearInterval(id);
  }, [phase, reduced]);

  if (phase === "uploading") {
    return (
      <div class="tryon-progress">
        <div class="tryon-progress__head">
          <span class="tryon-progress__step">Step 1 of {TOTAL_STEPS}</span>
          <span class="tryon-progress__pct">8%</span>
        </div>
        <div
          class="tryon-progress__track"
          role="progressbar"
          aria-valuenow={8}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div class="tryon-progress__fill" style="width:8%" />
        </div>
        <p class="tryon-progress__label">Sending your photo securely…</p>
      </div>
    );
  }

  // Optimistic curve: starts ~14%, eases toward ~95%, never reaches 100% until
  // the real result arrives (the dialog swaps to the celebratory "done" state).
  const tau = 8;
  const curve = 1 - Math.exp(-elapsed / tau);
  const pct = Math.min(95, Math.round(14 + 81 * curve));

  let stageIdx = STAGES.findIndex((s) => elapsed < s.until);
  if (stageIdx < 0) stageIdx = STAGES.length - 1;
  const label = STAGES[stageIdx].label.replace("{product}", productTitle);
  const overrun = elapsed > 30;

  return (
    <div class="tryon-progress">
      <div class="tryon-progress__head">
        <span class="tryon-progress__step">
          Step {stageIdx + 2} of {TOTAL_STEPS}
        </span>
        <span class="tryon-progress__pct">{pct}%</span>
      </div>
      <div
        class="tryon-progress__track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          class={`tryon-progress__fill${reduced ? "" : " tryon-progress__fill--anim"}`}
          style={`width:${pct}%`}
        />
      </div>
      <p class="tryon-progress__label">{label}…</p>

      <div
        class={`tryon-progress__skeleton${reduced ? "" : " tryon-progress__skeleton--shimmer"}`}
        aria-hidden="true"
      />

      <p class="tryon-progress__reassure">
        {overrun
          ? "Almost there, thanks for hanging on."
          : "Usually ready in under 30 seconds. Your photo stays private and is deleted within 24 hours."}
      </p>
      <p class="tryon-progress__tip">{reduced ? TIPS[0] : TIPS[tipIndex]}</p>
    </div>
  );
}
