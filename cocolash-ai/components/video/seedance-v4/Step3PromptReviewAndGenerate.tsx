"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EnhancorSettingsPanel } from "./EnhancorSettingsPanel";
import { CostBreakdown } from "./CostBreakdown";
import {
  SeedanceGenerationProgress,
  type GenerateEstimate,
} from "./SeedanceGenerationProgress";
import {
  buildSeedance20Body,
  buildSeedance25GenerateBody,
  effectiveDuration,
  isEnhancorParityUgc,
  multiFrameTotalSeconds,
} from "./lib/build-request";
import { hasRequiredInputs } from "./lib/mode-input-rules";
import type { SeedanceV4WizardState } from "./types";
import type {
  DirectorInput,
  DirectorMode,
} from "@/lib/ai/director/types";
import { estimateV4Cost } from "@/lib/costs/estimates";
import { formatProductFactsForPrompt } from "@/lib/ai/director/product-fact-extractor";
import {
  SEEDANCE_ENGINES,
  qualityTierToResolution,
} from "@/lib/seedance/engines";
import {
  SEEDANCE_25_LIMITS,
  SEEDANCE_25_MODE_LABELS,
} from "@/lib/seedance/v25/types";
import {
  Seedance25GenerateBodySchema,
  formatZodIssues,
} from "@/lib/seedance/v25/schema";
import { useVideoSettings } from "@/lib/settings/use-video-settings";
import { MIGRATION_REQUIRED_CODE } from "@/lib/supabase/schema-errors";

interface Step3Props {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReset: () => void;
  /** True only while the wizard is actually showing Step 3. The wizard keeps
   *  this step mounted (hidden) so navigation preserves state, so without this
   *  flag the auto-Director effect fires while the user is still on Step 1/2. */
  isActive?: boolean;
  goToStep?: (step: number) => void;
  /** Jump back to Step 1 for a new clip while KEEPING all uploaded images and
   *  settings (so the user doesn't re-upload product images each time). */
  onStartAnother?: () => void;
}

/**
 * Step 3 — review the AI-written Seedance prompt, edit if you want, approve & generate.
 *
 * For UGC mode with Enhancor-parity images (influencer + product angles):
 *   1. Call vision agent (/api/seedance/director-vision) to generate prompt from images
 *   2. Display image gallery (influencer + product thumbnails)
 *   3. Show generated prompt in editable textarea
 *   4. Show settings recap
 *   5. User can edit prompt and click "Approve & Generate"
 *
 * For other modes:
 *   1. Call legacy Director (/api/seedance/director)
 *   2. Display prompt in editable textarea
 *   3. User clicks [Approve & Generate]
 */
export function Step3PromptReviewAndGenerate({ state, setState, onReset, isActive = true, goToStep, onStartAnother }: Step3Props) {
  const [isWriting, setIsWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>(state.directorPrompt ?? "");
  const [editedSegments, setEditedSegments] = useState(
    state.directorMultiFramePrompts ?? []
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generation, setGeneration] = useState<{
    videoId: string;
    taskId?: string;
    estimate?: GenerateEstimate | null;
  } | null>(null);
  const [isSkuDegraded, setIsSkuDegraded] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  /** Claims the Director refused to stage because the images don't show them. */
  const [scriptAudit, setScriptAudit] = useState<string[]>([]);

  const { settings } = useVideoSettings();

  // Detect if we're in Enhancor-parity UGC mode (has influencer + product images)
  const isEnhancorParityMode = isEnhancorParityUgc(state);

  const is25 = state.engine === "2.5";
  const engineCaps = SEEDANCE_ENGINES[state.engine].capabilities;

  // Multi-frame: segments must sum to a length the engine accepts
  // (4–30 s on 2.5, 4–15 s on 2.0). Approve is blocked while they don't.
  const segmentTotal = multiFrameTotalSeconds(editedSegments);
  const segmentMax = engineCaps.durationMax;
  const segmentsOutOfRange =
    state.mode === "multi_frame" &&
    (segmentTotal < engineCaps.durationMin || segmentTotal > segmentMax);

  // Director attribution. Both are optional: the vision path reports no
  // system-prompt id on older responses, and a restored draft has no
  // diagnostics at all. Missing ⇒ the segment is dropped, never rendered as "?".
  const directorPromptId = state.directorDiagnostics?.systemPromptId?.trim() || null;
  const directorDurationMs =
    typeof state.directorDiagnostics?.durationMs === "number"
      ? state.directorDiagnostics.durationMs
      : null;

  // videos[] on multi_reference / edit / extend / multi_frame bills at the
  // cheaper "reduced" credit rate — the estimate has to know.
  const hasVideoInputs =
    state.inputVideoUrls.length > 0 || !!state.multiReferenceVideoUrl;

  /**
   * Vision agent path: call /api/seedance/director-vision with influencer + product images
   * (Enhancor-parity mode only)
   */
  const generatePromptFromVisionAgent = useCallback(async (variation = false) => {
    if (!isEnhancorParityMode) return;

    setVisionLoading(true);
    setVisionError(null);
    try {
      const response = await fetch("/api/seedance/director-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerImageUrl: state.ugcInfluencerImageUrl,
          // ALL influencer references, not just the scalar. Every one of them
          // already reaches Enhancor (build-request.ts), so the prompt writer
          // that has to describe them must see them too.
          ...(state.ugcInfluencerImageUrls?.length
            ? { influencerImageUrls: state.ugcInfluencerImageUrls }
            : {}),
          productImageUrls: state.ugcProductImageUrls,
          script: state.scriptText,
          campaignType: state.campaignType,
          // F2: the clip the user actually ordered. Without these the Director
          // wrote every prompt as if it were a 5-second 16:9 clip — a 12-second
          // 9:16 order arrived with one beat and no frame awareness.
          // `-1` (AUTO_DURATION) is Auto: the Director plans ~10 s for it.
          durationSeconds: effectiveDuration(state),
          aspectRatio: state.aspectRatio,
          // H4: when the avatar was composed holding the product, the first
          // influencer reference already shows the pickup as done.
          influencerAlreadyHoldsProduct: state.ugcWasComposed === true,
          // The wizard holds "" until a library category is chosen (the picker
          // sets it): send it only when it is real, so the Director's DB lookup
          // is either right or absent — never a lookup for "".
          ...(state.productSku?.trim()
            ? { productSku: state.productSku.trim() }
            : {}),
          // R-34.1-04: reuse the SAME cached facts the script was grounded in, so
          // the prompt and the script share one source of truth and can't drift.
          ...(state.productFacts
            ? { productFacts: formatProductFactsForPrompt(state.productFacts) }
            : {}),
          // Explicit "Regenerate": ask for a distinctly different scene so the
          // Director doesn't keep returning the same setup.
          ...(variation
            ? {
                variationHint:
                  "Give me a fresh, distinctly different scene from the previous version.",
              }
            : {}),
          // Per BLOCKER 1 (D-34-04): productSku stays OPTIONAL — the images
          // remain the primary source of product identity.
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Vision agent failed: ${response.statusText}`);
      }

      // Capture the inputsVersion at the time the vision agent ran
      const versionAtRun = state.inputsVersion;

      setState({
        directorPrompt: data.prompt,
        directorDiagnostics: data.diagnostics,
        directorPromptVersion: versionAtRun,
      });
      setEditedPrompt(data.prompt);
      setScriptAudit(Array.isArray(data.scriptAudit) ? data.scriptAudit : []);
      toast.success(
        variation
          ? "Fresh take generated — a different scene."
          : "Vision agent generated your prompt from the images."
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to generate prompt";
      setVisionError(msg);
      setScriptAudit([]);
      toast.error(msg);
    } finally {
      setVisionLoading(false);
    }
  }, [isEnhancorParityMode, state, setState]);

  const writeDirectorPrompt = useCallback(async () => {
    setIsWriting(true);
    setWriteError(null);
    try {
      const body = buildDirectorBody(state);
      const res = await fetch("/api/seedance/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Director failed");
      }

      // Capture the inputsVersion at the time the Director ran so we can
      // detect divergence later (user navigates back, edits, returns).
      const versionAtRun = state.inputsVersion;

      if (state.mode === "multi_frame") {
        setState({
          directorPrompt: "",
          directorMultiFramePrompts: data.multiFramePrompts,
          directorDiagnostics: data.diagnostics,
          directorPromptVersion: versionAtRun,
        });
        setEditedSegments(data.multiFramePrompts ?? []);
      } else {
        setState({
          directorPrompt: data.prompt,
          directorMultiFramePrompts: undefined,
          directorDiagnostics: data.diagnostics,
          directorPromptVersion: versionAtRun,
        });
        setEditedPrompt(data.prompt);
      }
      toast.success("Seedance Director wrote the prompt.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Director call failed";
      setWriteError(msg);
      toast.error(msg);
    } finally {
      setIsWriting(false);
    }
  }, [state, setState]);

  /**
   * Pre-check SKU degradation status (D-04) — call /api/seedance/check-references
   * when the SKU or mode changes. This determines whether to show a warning banner
   * before the user clicks "Generate".
   */
  useEffect(() => {
    async function checkSkuDegradation() {
      if (!state.productSku || !state.mode) {
        setIsSkuDegraded(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/seedance/check-references?sku=${encodeURIComponent(
            state.productSku
          )}&mode=${state.mode}`
        );
        if (!res.ok) {
          // Safe default: if check fails, don't warn
          setIsSkuDegraded(false);
          return;
        }

        const data = await res.json();
        setIsSkuDegraded(data.degraded === true);
      } catch {
        // Safe default: if check throws, don't warn
        setIsSkuDegraded(false);
      }
    }

    void checkSkuDegradation();
  }, [state.productSku, state.mode]);

  /**
   * For Enhancor-parity UGC mode: call vision agent on mount or when images/script change.
   * For other modes: call legacy Director when inputs change (existing logic).
   *
   * The vision agent runs once images are selected (Step 2 complete).
   * If user goes back to Step 2, changes images, and returns, we regenerate.
   */
  useEffect(() => {
    // Once a job is queued this step IS the live progress card. Re-running the
    // Director here would flip `isWriting` / `visionLoading` on, hit the
    // loading early-return below, unmount <SeedanceGenerationProgress> and kill
    // its poll — the user would watch the card vanish mid-render.
    if (generation) return;

    // The wizard keeps this step mounted while the user is on Step 1 / Step 2,
    // so an `inputsVersion` bump (a mode change, a new upload) reached the
    // Director before the mode's inputs existed — /api/seedance/director
    // answers 400 for those states and the user got a "Director failed" card
    // for a step they had not opened yet. Only write a prompt when Step 3 is on
    // screen AND the mode's required inputs are actually present.
    if (!isActive) return;
    if (!hasRequiredInputs(state)) return;

    if (isEnhancorParityMode) {
      if (visionLoading) return;
      const haveCachedOutput = !!state.directorPrompt;
      const isStale =
        haveCachedOutput &&
        typeof state.directorPromptVersion === "number" &&
        state.inputsVersion > state.directorPromptVersion;

      if (!haveCachedOutput || isStale) {
        void generatePromptFromVisionAgent();
      }
    } else {
      // Legacy Director path for non-UGC or non-Enhancor-parity modes
      if (isWriting) return;
      const haveCachedOutput =
        !!state.directorPrompt || !!state.directorMultiFramePrompts?.length;
      const isStale =
        haveCachedOutput &&
        typeof state.directorPromptVersion === "number" &&
        state.inputsVersion > state.directorPromptVersion;

      if (!haveCachedOutput || isStale) {
        void writeDirectorPrompt();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.inputsVersion, state.directorPromptVersion, isEnhancorParityMode, generation, isActive]);

  async function handleApproveAndGenerate() {
    setIsGenerating(true);
    try {
      // Engine 2.5 → the new envelope, validated client-side FIRST so a bad
      // combination (missing input, illegal duration) is reported instantly
      // instead of after a round trip. The route re-validates server-side.
      let body: unknown;
      if (is25) {
        const candidate = buildSeedance25GenerateBody(state, editedPrompt, editedSegments);
        const parsed = Seedance25GenerateBodySchema.safeParse(candidate);
        if (!parsed.success) {
          toast.error(formatZodIssues(parsed.error), { duration: 9000 });
          return;
        }
        body = candidate;
      } else {
        body = buildSeedance20Body(state, editedPrompt, editedSegments);
      }

      const res = await fetch("/api/seedance/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 503: the 20260908 migration has not been applied yet. The message
        // names the SQL file — show it long enough to act on.
        if (data?.code === MIGRATION_REQUIRED_CODE) {
          toast.error(data.error ?? "Database migration not applied", { duration: 12000 });
          return;
        }
        throw new Error(data?.error || "Seedance queue submission failed");
      }

      // Check for degraded flag from /api/seedance/generate response (D-04)
      // and display safety toast if the product had no reference images
      if (data.degraded) {
        toast.warning(
          `⚠️ This product has no reference images. The video may not show it accurately.`,
          { duration: 7000 }
        );
      }

      if (typeof data.videoId === "string") {
        setGeneration({
          videoId: data.videoId,
          taskId: typeof data.taskId === "string" ? data.taskId : undefined,
          estimate: (data.estimate as GenerateEstimate | undefined) ?? null,
        });
      }

      toast.success("Submitted to Seedance — watch it render right here.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  // Loading states — never while a generation is in flight (see the effect
  // above): the progress card must stay mounted so its poll survives.
  if (!generation && isEnhancorParityMode && visionLoading) {
    return (
      <div className="space-y-4 rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-coco-golden" />
        <div>
          <p className="text-sm font-semibold text-coco-brown">
            Vision agent is analyzing your images…
          </p>
          <p className="mt-1 text-xs text-coco-brown-medium/60">
            Generating a Seedance prompt from your selected influencer and product images.
          </p>
        </div>
      </div>
    );
  }

  if (!generation && !isEnhancorParityMode && isWriting) {
    return (
      <div className="space-y-4 rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-coco-golden" />
        <div>
          <p className="text-sm font-semibold text-coco-brown">
            Seedance Director is writing your prompt…
          </p>
          <p className="mt-1 text-xs text-coco-brown-medium/60">
            Claude Opus 4.7 · {modeLabel(state.mode)} mode
          </p>
        </div>
      </div>
    );
  }

  // Error states
  if (isEnhancorParityMode && visionError) {
    return (
      <div className="space-y-3 rounded-xl border-2 border-red-300 bg-red-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-900">Vision agent failed</p>
            <p className="mt-0.5 text-xs text-red-800">{visionError}</p>
          </div>
        </div>
        <Button onClick={() => generatePromptFromVisionAgent()} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (!isEnhancorParityMode && writeError) {
    return (
      <div className="space-y-3 rounded-xl border-2 border-red-300 bg-red-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-900">Director failed</p>
            <p className="mt-0.5 text-xs text-red-800">{writeError}</p>
          </div>
        </div>
        <Button onClick={writeDirectorPrompt} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Image Gallery (Enhancor-parity UGC mode only) */}
      {isEnhancorParityMode && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-coco-brown">Selected Images</h3>
          <div className="grid grid-cols-4 gap-4">
            {/* Influencer image (first) */}
            {state.ugcInfluencerImageUrl && (
              <div className="relative">
                <img
                  src={state.ugcInfluencerImageUrl}
                  alt="Influencer"
                  className="w-full aspect-square object-cover rounded-lg border border-coco-beige-dark"
                />
                <p className="text-xs text-coco-brown-medium mt-1">Influencer</p>
              </div>
            )}

            {/* Product images (subsequent) */}
            {state.ugcProductImageUrls?.map((url, idx) => (
              <div key={idx} className="relative">
                <img
                  src={url}
                  alt={`Product ${idx + 1}`}
                  className="w-full aspect-square object-cover rounded-lg border border-coco-beige-dark"
                />
                <p className="text-xs text-coco-brown-medium mt-1">Product {idx + 1}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Director output */}
      {state.mode === "multi_frame" ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-coco-brown">
              Segment plan
            </h3>
            <button
              type="button"
              onClick={writeDirectorPrompt}
              className="flex items-center gap-1 text-xs font-medium text-coco-golden hover:text-coco-golden-dark"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          </div>
          <p className="text-[11px] text-coco-brown-medium/60">
            The Director split your {segmentTotal}s clip into {editedSegments.length} segments. Edit each segment&apos;s prompt or duration before approving.
          </p>
          {editedSegments.map((seg, i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border-2 border-coco-beige-dark bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-coco-golden/20 px-2 py-0.5 text-[10px] font-bold uppercase text-coco-golden">
                  Shot {i + 1}
                </span>
                <input
                  type="number"
                  value={seg.duration}
                  min={1}
                  max={segmentMax}
                  onChange={(e) => {
                    const newDuration = Math.max(
                      1,
                      Math.min(segmentMax, Number(e.target.value) || 1)
                    );
                    setEditedSegments((prev) =>
                      prev.map((s, idx) => (idx === i ? { ...s, duration: newDuration } : s))
                    );
                  }}
                  className="w-16 rounded border border-coco-beige-dark bg-white px-2 py-1 text-xs text-coco-brown outline-none focus:border-coco-golden"
                />
                <span className="text-[11px] text-coco-brown-medium">seconds</span>
              </div>
              <textarea
                value={seg.prompt}
                onChange={(e) =>
                  setEditedSegments((prev) =>
                    prev.map((s, idx) => (idx === i ? { ...s, prompt: e.target.value } : s))
                  )
                }
                rows={3}
                className="w-full rounded-lg border border-coco-beige-dark bg-white p-2 text-xs text-coco-brown outline-none focus:border-coco-golden"
              />
            </div>
          ))}
          <p
            className={cn(
              "text-[11px]",
              segmentsOutOfRange
                ? "font-semibold text-red-600"
                : "text-coco-brown-medium/50"
            )}
          >
            Total: {segmentTotal}s (must be {engineCaps.durationMin}–{segmentMax}s
            {" "}on {SEEDANCE_ENGINES[state.engine].label})
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-coco-brown">
              Seedance prompt
            </h3>
            <button
              type="button"
              onClick={
                isEnhancorParityMode
                  ? () => generatePromptFromVisionAgent(true)
                  : writeDirectorPrompt
              }
              disabled={isWriting || visionLoading}
              className="flex items-center gap-1 text-xs font-medium text-coco-golden transition-colors hover:text-coco-golden-dark disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate with Director
            </button>
          </div>
          {/* The system-prompt id is only shown when the Director actually
              reported one — a bare "?" told the user nothing. */}
          <p className="text-[11px] text-coco-brown-medium/60">
            The Seedance Director (Claude Opus 4.7
            {directorPromptId ? (
              <>
                ,{" "}
                <code className="rounded bg-coco-beige px-1">{directorPromptId}</code>
              </>
            ) : null}
            ) wrote this for you. Edit anything you want before approving.
          </p>
          <textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            rows={Math.min(20, Math.max(6, editedPrompt.split("\n").length + 1))}
            className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-xs text-coco-brown outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
          />
          <p className="text-[10px] text-coco-brown-medium/50">
            {editedPrompt.length} characters.
            {typeof directorDurationMs === "number"
              ? ` Director took ${directorDurationMs}ms.`
              : ""}
          </p>
          {/* The Director audited the script against the product images. These
              claims were not visible in them, so they were kept out of the
              visuals — the user sees exactly what changed and why. */}
          {scriptAudit.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-900">
                  The script claimed things the product images don&apos;t show
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-amber-800">
                  {scriptAudit.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-amber-700/80">
                  They were left out of the visual prompt so the video shows the
                  real product.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Enhancor settings — read-only recap on engine 2.5 (Step 1's
          OutputSettingsPanel owns 2.5 output settings; this panel's legacy
          Resolution control writes `resolution` and would NOT update
          `qualityTier`, so an interactive panel here could bill a 2.5 job at a
          resolution the rest of the UI never shows) and for Enhancor-parity
          UGC. Editable only on engine 2.0. */}
      <EnhancorSettingsPanel
        state={state}
        setState={state.engine === "2.5" || isEnhancorParityMode ? undefined : setState}
        hideDuration={state.mode === "lipsyncing"}
        hideTopLevelDuration={state.mode === "multi_frame"}
      />

      {/* Itemized cost breakdown — every component cost shown so the user
          knows exactly what they're paying for before clicking Approve. */}
      <CostBreakdown
        variant="detailed"
        breakdown={estimateV4Cost({
          mode: state.mode,
          // Seedance 2.5 prices per second in credits: send the EFFECTIVE
          // duration (-1 ⇒ Auto, estimated on 10 s) and the tier's resolution,
          // plus the live rate table from video_settings.
          durationSeconds: is25 ? effectiveDuration(state) : state.duration,
          resolution: is25 ? qualityTierToResolution(state.qualityTier) : state.resolution,
          engine: state.engine,
          isUncensored: state.isUncensored,
          hasVideoInputs: hasVideoInputs,
          multiFrameDurations:
            state.mode === "multi_frame"
              ? editedSegments.map((s) => s.duration)
              : undefined,
          rates: settings.rates,
          usdPerCredit: settings.usd_per_credit,
          generatesAvatar:
            state.mode === "ugc" ||
            state.mode === "multi_frame" ||
            (state.mode === "first_n_last_frames" && !!state.firstFrameUrl),
          composesProduct:
            (state.mode === "ugc" || state.mode === "multi_frame") &&
            !!state.ugcWasComposed,
          generatesLastFrame:
            state.mode === "first_n_last_frames" && !!state.lastFrameUrl,
          generatesScript:
            state.mode !== "lipsyncing" && state.mode !== "text_to_video",
        })}
      />

      {/* Pre-check warning banner (D-04) — shown before user clicks Generate */}
      {isSkuDegraded && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-yellow-200 bg-yellow-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
          <div>
            <p className="text-sm font-semibold text-yellow-900">
              Limited reference images
            </p>
            <p className="mt-0.5 text-xs text-yellow-800">
              This product has no reference images. Your video may not be perfectly accurate, but you can still proceed.
            </p>
          </div>
        </div>
      )}

      {/* Approve & generate — once queued this becomes the live progress view (D11) */}
      {generation ? (
        <SeedanceGenerationProgress
          videoId={generation.videoId}
          engine={state.engine}
          estimate={generation.estimate}
          onCreateAnother={
            onStartAnother
              ? () => {
                  setGeneration(null);
                  onStartAnother();
                }
              : undefined
          }
          onRerendered={(newVideoId) =>
            setGeneration({ videoId: newVideoId, estimate: null })
          }
        />
      ) : (
        <div className="flex gap-3">
          {isEnhancorParityMode && goToStep ? (
            <Button
              onClick={() => goToStep(2)}
              variant="outline"
              className="gap-2 py-5"
              size="lg"
            >
              Back
            </Button>
          ) : (
            <Button onClick={onReset} variant="outline" className="gap-2 py-5" size="lg">
              Start Over
            </Button>
          )}
          <Button
            onClick={handleApproveAndGenerate}
            disabled={
              isGenerating ||
              visionLoading ||
              segmentsOutOfRange ||
              (state.mode === "multi_frame"
                ? editedSegments.length === 0
                : !editedPrompt.trim())
            }
            className={cn(
              "flex-1 gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
            )}
            size="lg"
          >
            {isGenerating || visionLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isGenerating ? "Submitting…" : "Generating…"}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Approve &amp; Generate
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function modeLabel(mode: DirectorMode): string {
  return SEEDANCE_25_MODE_LABELS[mode] ?? mode;
}

function buildDirectorBody(state: SeedanceV4WizardState): DirectorInput {
  const base: DirectorInput = {
    mode: state.mode,
    campaignType: state.campaignType,
    tone: state.tone,
    // Auto (-1) tells the Director to write for an unspecified length; the
    // script sizer treats it as ~10 s (package F).
    durationSeconds:
      state.engine === "2.5" ? effectiveDuration(state) : state.duration,
    aspectRatio: state.aspectRatio,
    script: state.scriptText || undefined,
    productSku: state.productSku || undefined,
  };

  switch (state.mode) {
    case "ugc":
      return {
        ...base,
        composedPersonProductImage: state.ugcComposedImageUrl
          ? { url: state.ugcComposedImageUrl }
          : undefined,
      };
    case "multi_reference":
      return {
        ...base,
        referenceImages: state.multiReferenceImages,
        referenceVideoUrl: state.multiReferenceVideoUrl,
        referenceAudioUrl: state.multiReferenceAudioUrl,
        referenceVideoUrls: state.inputVideoUrls.length ? state.inputVideoUrls : undefined,
        referenceAudioUrls: state.inputAudioUrls.length ? state.inputAudioUrls : undefined,
        userInstructions: state.multiReferenceUserInstructions,
      };
    case "lipsyncing":
      return {
        ...base,
        composedPersonProductImage: state.lipsyncImageUrl
          ? { url: state.lipsyncImageUrl }
          : undefined,
        referenceAudioUrl: state.lipsyncAudioUrl,
        referenceVideoUrl: state.lipsyncVideoUrl,
      };
    case "voice_clone": {
      // Same inputs as lip-sync: a face + the voice to clone.
      const faceUrl = state.inputImageUrls[0] ?? state.lipsyncImageUrl;
      return {
        ...base,
        composedPersonProductImage: faceUrl ? { url: faceUrl } : undefined,
        referenceAudioUrl: state.lipsyncAudioUrl,
      };
    }
    case "edit":
    case "extend":
      // The Director needs the source clip(s) plus what to change / how to
      // continue — that instruction is the whole brief for these two modes.
      return {
        ...base,
        sourceVideoUrls: state.inputVideoUrls.length ? state.inputVideoUrls : undefined,
        editInstruction: state.editInstruction || undefined,
      };
    case "first_n_last_frames":
      return {
        ...base,
        firstFrameImage: state.firstFrameUrl ? { url: state.firstFrameUrl } : undefined,
        lastFrameImage: state.lastFrameUrl ? { url: state.lastFrameUrl } : undefined,
      };
    case "multi_frame":
      // Phase 26, D-26-01: Multi-Frame is now TEXT-ONLY. Director receives
      // campaignType + script + subjectBrief and outputs multi_frame_prompts[]
      // with textual descriptions (no image inputs, no @avatar/@product refs).
      return {
        ...base,
        subjectBrief: state.subjectBrief,
        // 3-second segments are a reasonable default per the Director prompt's
        // best-practices guide; 2.5 allows up to 10 segments / 30 s.
        multiFrameSegmentCount: Math.max(
          2,
          Math.min(
            SEEDANCE_25_LIMITS.maxMultiFrameSegments,
            Math.round((state.duration > 0 ? state.duration : 8) / 3)
          )
        ),
      };
    case "text_to_video":
      return {
        ...base,
        sceneDescription: state.t2vSceneDescription,
      };
    default:
      return base;
  }
}
