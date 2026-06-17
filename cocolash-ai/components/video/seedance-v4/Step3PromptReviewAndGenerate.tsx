"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Sparkles, RefreshCw, Check, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EnhancorSettingsPanel } from "./EnhancorSettingsPanel";
import { CostBreakdown } from "./CostBreakdown";
import type { SeedanceV4WizardState } from "./types";
import type {
  DirectorInput,
  DirectorMode,
} from "@/lib/ai/director/types";
import { estimateV4Cost } from "@/lib/costs/estimates";
import { formatProductFactsForPrompt } from "@/lib/ai/director/product-fact-extractor";

interface Step3Props {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReset: () => void;
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
export function Step3PromptReviewAndGenerate({ state, setState, onReset, goToStep, onStartAnother }: Step3Props) {
  const [isWriting, setIsWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>(state.directorPrompt ?? "");
  const [editedSegments, setEditedSegments] = useState(
    state.directorMultiFramePrompts ?? []
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [isSkuDegraded, setIsSkuDegraded] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);

  // Detect if we're in Enhancor-parity UGC mode (has influencer + product images)
  const isEnhancorParityMode =
    state.mode === "ugc" &&
    !!state.ugcInfluencerImageUrl &&
    state.ugcProductImageUrls &&
    state.ugcProductImageUrls.length > 0;

  /**
   * Vision agent path: call /api/seedance/director-vision with influencer + product images
   * (Enhancor-parity mode only)
   */
  const generatePromptFromVisionAgent = useCallback(async () => {
    if (!isEnhancorParityMode) return;

    setVisionLoading(true);
    setVisionError(null);
    try {
      const response = await fetch("/api/seedance/director-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerImageUrl: state.ugcInfluencerImageUrl,
          productImageUrls: state.ugcProductImageUrls,
          script: state.scriptText,
          campaignType: state.campaignType,
          // R-34.1-04: reuse the SAME cached facts the script was grounded in, so
          // the prompt and the script share one source of truth and can't drift.
          ...(state.productFacts
            ? { productFacts: formatProductFactsForPrompt(state.productFacts) }
            : {}),
          // Per BLOCKER 1 (D-34-04): NO productSku required — images are sole source of identity
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
      toast.success("Vision agent generated your prompt from the images.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to generate prompt";
      setVisionError(msg);
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
  }, [state.inputsVersion, state.directorPromptVersion, isEnhancorParityMode]);

  async function handleApproveAndGenerate() {
    setIsGenerating(true);
    setGenerationStarted(true);
    try {
      // For Enhancor-parity UGC mode, build payload with influencers[] and products[] arrays
      const body = isEnhancorParityMode
        ? buildEnhancorBodyV4UGC(state, editedPrompt)
        : buildEnhancorBody(state, editedPrompt, editedSegments);

      const res = await fetch("/api/seedance/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Seedance queue submission failed");
      }

      // Check for degraded flag from /api/seedance/generate response (D-04)
      // and display safety toast if the product had no reference images
      if (data.degraded) {
        toast.warning(
          `⚠️ This product has no reference images. The video may not show it accurately.`,
          { duration: 7000 }
        );
      }

      toast.success(
        "Submitted to Seedance. You'll see the video in the gallery when it's ready."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
      setGenerationStarted(false);
    } finally {
      setIsGenerating(false);
    }
  }

  // Loading states
  if (isEnhancorParityMode && visionLoading) {
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

  if (!isEnhancorParityMode && isWriting) {
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
        <Button onClick={generatePromptFromVisionAgent} variant="outline" size="sm" className="gap-1.5">
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
            The Director split your {state.duration}s clip into {editedSegments.length} segments. Edit each segment&apos;s prompt or duration before approving.
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
                  max={15}
                  onChange={(e) => {
                    const newDuration = Math.max(1, Math.min(15, Number(e.target.value)));
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
          <p className="text-[11px] text-coco-brown-medium/50">
            Total: {editedSegments.reduce((sum, s) => sum + s.duration, 0)}s
            (must be 4–15s)
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
              onClick={writeDirectorPrompt}
              className="flex items-center gap-1 text-xs font-medium text-coco-golden hover:text-coco-golden-dark"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate with Director
            </button>
          </div>
          <p className="text-[11px] text-coco-brown-medium/60">
            The Seedance Director (Claude Opus 4.7,{" "}
            <code className="rounded bg-coco-beige px-1">{state.directorDiagnostics?.systemPromptId ?? "?"}</code>) wrote this for you. Edit anything you want before approving.
          </p>
          <textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            rows={Math.min(20, Math.max(6, editedPrompt.split("\n").length + 1))}
            className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-xs text-coco-brown outline-none focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
          />
          <p className="text-[10px] text-coco-brown-medium/50">
            {editedPrompt.length} characters. Director took{" "}
            {state.directorDiagnostics?.durationMs ?? "?"}ms.
          </p>
        </section>
      )}

      {/* Enhancor settings — read-only for Enhancor-parity, editable for others */}
      <EnhancorSettingsPanel
        state={state}
        setState={isEnhancorParityMode ? undefined : setState}
        hideDuration={state.mode === "lipsyncing"}
        hideTopLevelDuration={state.mode === "multi_frame"}
      />

      {/* Itemized cost breakdown — every component cost shown so the user
          knows exactly what they're paying for before clicking Approve. */}
      <CostBreakdown
        variant="detailed"
        breakdown={estimateV4Cost({
          mode: state.mode,
          durationSeconds: state.duration,
          resolution: state.resolution,
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

      {/* Approve & generate */}
      {generationStarted && !isGenerating ? (
        <div className="space-y-3 rounded-xl border-2 border-green-300 bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 shrink-0 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-900">
                Submitted to Seedance.
              </p>
              <p className="text-xs text-green-800">
                Open <code>/video/gallery</code> to watch progress.
              </p>
            </div>
          </div>
          {onStartAnother && (
            <Button
              onClick={() => {
                setGenerationStarted(false);
                onStartAnother();
              }}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <Sparkles className="h-3 w-3" />
              Create another video (keeps your images)
            </Button>
          )}
        </div>
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
  return (
    {
      ugc: "UGC",
      multi_reference: "Multi-Reference",
      multi_frame: "Multi-Frame",
      lipsyncing: "Lip-Sync",
      first_n_last_frames: "First+Last Frame",
      text_to_video: "Text-to-Video",
    } as const
  )[mode];
}

function buildDirectorBody(state: SeedanceV4WizardState): DirectorInput {
  const base: DirectorInput = {
    mode: state.mode,
    campaignType: state.campaignType,
    tone: state.tone,
    durationSeconds: state.duration,
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
        // best-practices guide. Caps at 5 segments × 3s for a 15s clip.
        multiFrameSegmentCount: Math.max(
          2,
          Math.min(5, Math.round(state.duration / 3))
        ),
      };
    case "text_to_video":
      return {
        ...base,
        sceneDescription: state.t2vSceneDescription,
      };
  }
}

/**
 * Build payload for Enhancor-parity UGC mode (Plan 34-04).
 * Sends influencer-first image arrays + edited prompt + all settings.
 * Per BLOCKER 1 (D-34-04): NO productSku required — images are sole source of identity.
 */
function buildEnhancorBodyV4UGC(
  state: SeedanceV4WizardState,
  editedPrompt: string
): Record<string, unknown> {
  return {
    type: "image-to-video",
    seedanceMode: "ugc",
    prompt: editedPrompt,
    duration: state.duration,
    resolution: state.resolution,
    aspectRatio: state.aspectRatio,
    fullAccess: state.fullAccess ?? true,
    unrestricted: state.unrestricted ?? false,
    quality: state.quality ?? "standard",
    // Images: influencer FIRST, then products (per @-mention alignment)
    influencers: state.ugcInfluencerImageUrl ? [state.ugcInfluencerImageUrl] : [],
    products: state.ugcProductImageUrls || [],
    // Script for downstream reference
    scriptText: state.scriptText,
    campaignType: state.campaignType,
    tone: state.tone,
    fastMode: state.fastMode,
    // Legacy compat fields (kept for backward compatibility)
    personImageUrl: state.ugcInfluencerImageUrl,
    productImageUrl: state.ugcProductImageUrls?.[0],
    overridePrompt: editedPrompt,
    // NO productSku per BLOCKER 1 (D-34-04)
  };
}

function buildEnhancorBody(
  state: SeedanceV4WizardState,
  editedPrompt: string,
  editedSegments: { prompt: string; duration: number }[]
): Record<string, unknown> {
  const common = {
    aspectRatio: state.aspectRatio,
    resolution: state.resolution,
    duration: state.duration,
    fastMode: state.fastMode && state.resolution !== "1080p",
    campaignType: state.campaignType,
    tone: state.tone,
    seedanceMode: state.mode === "text_to_video" ? "ugc" : state.mode,
    // Pass the selected SKU so the generate route can resolve its DB reference
    // images and attach them to the Enhancor payload (Phase 29 reference
    // conditioning). Without this the resolver receives undefined and no
    // product references reach generation.
    productSku: state.productSku || undefined,
    fullAccess: true,
    // Carry the script for downstream (some current API code expects it)
    scriptText: state.scriptText,
    // Pass the AI-approved prompt as the AUTHORITATIVE prompt — the existing
    // /api/seedance/generate route can use this directly without rerunning
    // its planner.
    overridePrompt:
      state.mode === "multi_frame"
        ? editedSegments
            .map((s, i) => `Shot ${i + 1} (${s.duration}s): ${s.prompt}`)
            .join("\n\n")
        : editedPrompt,
  };

  switch (state.mode) {
    case "ugc":
      // Two paths:
      //  - toggle ON: ugcComposedImageUrl is a SINGLE composed image (avatar
      //    already holding product). productImageUrl carries the same URL so
      //    the legacy /api/seedance/generate route keeps a value in its
      //    required field, but Seedance receives ONE image visually.
      //  - toggle OFF: ugcComposedImageUrl is the avatar-only image;
      //    ugcSeparateProductUrl is the separate product reference. Both go.
      return {
        ...common,
        type: "image-to-video",
        personImageUrl: state.ugcComposedImageUrl,
        productImageUrl: state.ugcWasComposed
          ? state.ugcComposedImageUrl
          : state.ugcSeparateProductUrl,
      };
    case "text_to_video":
      return {
        ...common,
        type: "text-to-video",
      };
    case "multi_reference":
      return {
        ...common,
        type: "image-to-video",
        images: state.multiReferenceImages?.map((r) => r.url) ?? [],
        videos: state.multiReferenceVideoUrl ? [state.multiReferenceVideoUrl] : [],
        audios: state.multiReferenceAudioUrl ? [state.multiReferenceAudioUrl] : [],
      };
    case "lipsyncing":
      return {
        ...common,
        type: "image-to-video",
        personImageUrl: state.lipsyncImageUrl,
        audios: state.lipsyncAudioUrl ? [state.lipsyncAudioUrl] : [],
        videos: state.lipsyncVideoUrl ? [state.lipsyncVideoUrl] : [],
      };
    case "first_n_last_frames":
      return {
        ...common,
        type: "image-to-video",
        firstFrameImage: state.firstFrameUrl,
        lastFrameImage: state.lastFrameUrl,
      };
    case "multi_frame": {
      // Phase 26, D-26-01: Multi-Frame is TEXT-ONLY. Enhancor API silently drops
      // images[] / products[] / influencers[] for mode=multi_frame. The only
      // required field is multi_frame_prompts[] (each segment has prompt + duration).
      // No top-level prompt, no top-level duration (those live inside segments).
      return {
        ...common,
        type: "image-to-video",
        multiFramePrompts: editedSegments,
      };
    }
  }
}
