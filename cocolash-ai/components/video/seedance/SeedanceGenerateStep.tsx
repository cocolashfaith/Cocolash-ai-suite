"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  Download,
  RefreshCw,
  Clock,
  Film,
  DollarSign,
  Lock,
  Unlock,
} from "lucide-react";
import type {
  SeedanceAspectRatio,
  SeedanceAudioMode,
  SeedanceDuration,
  SeedanceGenerationType,
  SeedanceMode,
  SeedanceMultiFramePrompt,
  SeedanceResolution,
} from "@/lib/seedance/types";
import { calculateSeedanceCost, calculateVideoCost } from "@/lib/costs/estimates";
import type { UGCScene, UGCVibe } from "@/lib/seedance/ugc-image-prompt";
import type {
  CampaignType,
  ScriptTone,
  ScriptResult,
  HeyGenVideoStatus,
} from "@/lib/types";

interface SeedanceGenerateStepProps {
  script: ScriptResult;
  editedScriptText?: string;
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: number;
  personImageUrl: string;
  productImageUrl: string;
  audioMode: SeedanceAudioMode;
  audioUrl?: string;
  scene: UGCScene;
  vibe: UGCVibe;
  personDescription: string;
  onReset: () => void;
}

type EnhancorUiMode = SeedanceMode | "text-to-video";

const ENHANCOR_MODES: {
  value: EnhancorUiMode;
  title: string;
  description: string;
  badge: string;
}[] = [
  {
    value: "ugc",
    title: "UGC",
    description: "Default one-avatar + one-product workflow.",
    badge: "Default",
  },
  {
    value: "multi_reference",
    title: "Multi-reference",
    description: "Blend image, video, and audio references.",
    badge: "Refs",
  },
  {
    value: "multi_frame",
    title: "Multi-frame",
    description: "Build a short sequence from multiple timed prompts.",
    badge: "Scenes",
  },
  {
    value: "lipsyncing",
    title: "Lip-sync",
    description: "Use voice audio for talking or lip-sync style output.",
    badge: "Audio",
  },
  {
    value: "first_n_last_frames",
    title: "First + last frame",
    description: "Guide the transition between start and end images.",
    badge: "Frames",
  },
  {
    value: "text-to-video",
    title: "Text-to-video",
    description: "Prompt-only generation with no media references sent.",
    badge: "Prompt",
  },
];

const ASPECT_RATIOS: { value: SeedanceAspectRatio; label: string; desc: string }[] = [
  { value: "9:16", label: "9:16", desc: "TikTok / Reels" },
  { value: "1:1", label: "1:1", desc: "Square" },
  { value: "16:9", label: "16:9", desc: "Landscape" },
  { value: "3:4", label: "3:4", desc: "Portrait" },
  { value: "4:3", label: "4:3", desc: "Classic" },
  { value: "21:9", label: "21:9", desc: "Cinematic" },
];

const RESOLUTIONS: { value: SeedanceResolution; label: string }[] = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
];

const DURATIONS: { value: SeedanceDuration; label: string }[] = [
  { value: "5", label: "5s" },
  { value: "8", label: "8s" },
  { value: "10", label: "10s" },
  { value: "15", label: "15s" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing...",
  processing: "Generating UGC video...",
  captioning: "Processing & finalizing...",
  completed: "Complete!",
  failed: "Failed",
};

const STEP_LABELS = [
  "Submitting to Seedance 2.0...",
  "AI is creating your UGC video...",
  "Processing & finalizing...",
];

export function SeedanceGenerateStep(props: SeedanceGenerateStepProps) {
  const {
    script,
    editedScriptText,
    campaignType,
    tone,
    duration,
    personImageUrl,
    productImageUrl,
    audioMode,
    audioUrl,
    scene,
    vibe,
    personDescription,
    onReset,
  } = props;

  const [aspectRatio, setAspectRatio] = useState<SeedanceAspectRatio>("9:16");
  const [fixedLens, setFixedLens] = useState(false);
  const [enhancorMode, setEnhancorMode] = useState<EnhancorUiMode>("ugc");
  const [resolution, setResolution] = useState<SeedanceResolution>("720p");
  const [seedanceDuration, setSeedanceDuration] = useState<SeedanceDuration>(
    duration <= 5 ? "5" : duration <= 8 ? "8" : duration <= 10 ? "10" : "15"
  );
  const [fullAccess, setFullAccess] = useState(true);
  const [ugcProductsText, setUgcProductsText] = useState("");
  const [ugcInfluencersText, setUgcInfluencersText] = useState("");
  const [referenceImagesText, setReferenceImagesText] = useState("");
  const [referenceVideosText, setReferenceVideosText] = useState("");
  const [referenceAudiosText, setReferenceAudiosText] = useState("");
  const [firstFrameImage, setFirstFrameImage] = useState(personImageUrl);
  const [lastFrameImage, setLastFrameImage] = useState("");
  const [lipsyncingAudio, setLipsyncingAudio] = useState(audioUrl ?? "");
  const [multiFramePrompts, setMultiFramePrompts] = useState<SeedanceMultiFramePrompt[]>([
    { prompt: "Wide opening shot showing the creator and product in a natural UGC setting", duration: 5 },
    { prompt: "Close-up product moment with a confident smile and clear beauty result", duration: 5 },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [status, setStatus] = useState<HeyGenVideoStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback((id: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/seedance/${id}/status`);
        const data = await res.json();
        if (!res.ok) return;

        setStatus(data.status);
        setProgress(data.progress ?? 0);

        if (data.status === "processing") setPipelineStep(1);
        if (data.status === "captioning") setPipelineStep(2);

        if (data.status === "completed") {
          stopPolling();
          setFinalVideoUrl(data.finalVideoUrl ?? null);
          setThumbnailUrl(data.thumbnailUrl ?? null);
          setPipelineStep(2);
          setIsGenerating(false);
          toast.success("UGC video generated!");
        }

        if (data.status === "failed") {
          stopPolling();
          setError(data.error ?? "Video generation failed");
          setIsGenerating(false);
          toast.error("Video generation failed");
        }
      } catch { /* retry on next interval */ }
    }, 10000);
  }, [stopPolling]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setVideoId(null);
    setStatus("pending");
    setProgress(0);
    setPipelineStep(0);
    setFinalVideoUrl(null);
    setThumbnailUrl(null);

    try {
      const scriptText = editedScriptText || script.full_script;
      const generationType: SeedanceGenerationType =
        enhancorMode === "text-to-video" ? "text-to-video" : "image-to-video";
      const seedanceMode: SeedanceMode =
        enhancorMode === "text-to-video" ? "ugc" : enhancorMode;
      const extraImages = parseUrlList(referenceImagesText);
      const extraVideos = parseUrlList(referenceVideosText);
      const extraAudios = parseUrlList(referenceAudiosText);
      const extraProducts = parseUrlList(ugcProductsText);
      const extraInfluencers = parseUrlList(ugcInfluencersText);
      const defaultImages = [personImageUrl, productImageUrl, ...extraImages].filter(Boolean);
      const defaultAudios = audioUrl ? [audioUrl, ...extraAudios] : extraAudios;
      const cleanedMultiFramePrompts = multiFramePrompts
        .map((item) => ({ prompt: item.prompt.trim(), duration: item.duration }))
        .filter((item) => item.prompt.length > 0 && item.duration > 0);

      if (enhancorMode === "multi_frame" && cleanedMultiFramePrompts.length === 0) {
        throw new Error("Add at least one multi-frame prompt.");
      }
      if (enhancorMode === "lipsyncing" && defaultAudios.length === 0 && !lipsyncingAudio.trim()) {
        throw new Error("Add or upload an audio URL for lip-sync mode.");
      }

      const res = await fetch("/api/seedance/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personImageUrl,
          productImageUrl,
          campaignType,
          tone,
          duration,
          scriptText,
          audioMode,
          audioUrl,
          aspectRatio,
          seedanceDuration,
          resolution,
          generationType,
          seedanceMode,
          fullAccess,
          products: enhancorMode === "ugc" ? [productImageUrl, ...extraProducts] : undefined,
          influencers: enhancorMode === "ugc" ? [personImageUrl, ...extraInfluencers] : undefined,
          images:
            enhancorMode === "multi_reference" || enhancorMode === "lipsyncing"
              ? defaultImages
              : undefined,
          videos:
            enhancorMode === "multi_reference" ||
            enhancorMode === "lipsyncing" ||
            enhancorMode === "first_n_last_frames" ||
            enhancorMode === "multi_frame"
              ? extraVideos
              : undefined,
          audios:
            enhancorMode === "multi_reference" ||
            enhancorMode === "lipsyncing" ||
            enhancorMode === "first_n_last_frames" ||
            enhancorMode === "multi_frame"
              ? defaultAudios
              : undefined,
          firstFrameImage:
            enhancorMode === "first_n_last_frames" ? firstFrameImage : undefined,
          lastFrameImage:
            enhancorMode === "first_n_last_frames" ? lastFrameImage.trim() : undefined,
          lipsyncingAudio:
            enhancorMode === "lipsyncing" ? lipsyncingAudio.trim() || audioUrl : undefined,
          multiFramePrompts:
            enhancorMode === "multi_frame" ? cleanedMultiFramePrompts : undefined,
          fixedLens,
          generateAudio: true,
          scene,
          vibe,
          personDescription,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed");
        setStatus("failed");
        setIsGenerating(false);
        toast.error(data.error || "Generation failed");
        return;
      }

      setVideoId(data.videoId);
      setStatus("processing");
      setPipelineStep(1);
      toast.success("Video submitted to Seedance 2.0!");
      pollStatus(data.videoId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error — please try again.";
      setError(message);
      setStatus("failed");
      setIsGenerating(false);
      toast.error(message);
    }
  };

  const scriptText = editedScriptText || script.full_script;
  const seedanceDurationNumber = parseInt(seedanceDuration, 10);

  const seedanceCost = calculateSeedanceCost({
    duration: seedanceDurationNumber,
    includeScript: true,
    includeImageGen: true,
    includePostProcessing: true,
  });

  const heygenCost = calculateVideoCost({
    duration: seedanceDurationNumber,
    addCaptions: true,
    addWatermark: true,
    needsScriptGeneration: true,
  });

  const updateMultiFramePrompt = (
    index: number,
    nextPrompt: SeedanceMultiFramePrompt
  ) => {
    setMultiFramePrompts((prev) =>
      prev.map((item, frameIndex) => (frameIndex === index ? nextPrompt : item))
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary + settings — shown before generation */}
      {!isGenerating && !finalVideoUrl && !error && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">Video Summary</label>
            <div className="space-y-2 rounded-xl border-2 border-coco-beige-dark bg-white p-4">
              <SummaryRow label="Campaign" value={campaignType} />
              <SummaryRow label="Tone" value={tone} />
              <SummaryRow label="Duration" value={`${duration}s (Seedance: ${seedanceDuration}s)`} />
              <SummaryRow label="Enhancor Mode" value={getModeTitle(enhancorMode)} />
              <SummaryRow label="Resolution" value={resolution} />
              <SummaryRow label="Audio Mode" value={audioMode === "script-in-prompt" ? "AI Speaks" : "Uploaded Audio"} />
              <SummaryRow label="Scene" value={scene} />
              <SummaryRow label="Vibe" value={vibe} />
              <div className="flex gap-3 pt-2">
                {personImageUrl && (
                  <div className="h-16 w-12 overflow-hidden rounded-lg border border-coco-beige-dark">
                    <img src={personImageUrl} alt="Person" className="h-full w-full object-cover" />
                  </div>
                )}
                {productImageUrl && (
                  <div className="h-16 w-12 overflow-hidden rounded-lg border border-coco-beige-dark">
                    <img src={productImageUrl} alt="Product" className="h-full w-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Script preview */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">Script</label>
            <div className="rounded-xl border-2 border-coco-beige-dark bg-white/60 p-4">
              <p className="line-clamp-4 whitespace-pre-wrap text-xs text-coco-brown-medium">{scriptText}</p>
            </div>
          </div>

          {/* Enhancor mode */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-coco-brown">Enhancor API Mode</label>
              <p className="mt-1 text-xs text-coco-brown-medium/60">
                Default is UGC: one avatar image + one product image. Switch modes to expose the full Seedance Full Access API inputs.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ENHANCOR_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setEnhancorMode(mode.value)}
                  className={cn(
                    "rounded-xl border-2 bg-white p-3 text-left transition-all",
                    enhancorMode === mode.value
                      ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                      : "border-coco-beige-dark hover:border-coco-golden/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-sm font-bold", enhancorMode === mode.value ? "text-coco-golden" : "text-coco-brown")}>
                      {mode.title}
                    </p>
                    <span className="rounded-full bg-coco-beige px-2 py-0.5 text-[10px] font-semibold text-coco-brown-medium">
                      {mode.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-coco-brown-medium/60">
                    {mode.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Core API controls */}
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionGroup label="Resolution">
              <div className="grid grid-cols-2 gap-2">
                {RESOLUTIONS.map((item) => (
                  <PillButton
                    key={item.value}
                    isSelected={resolution === item.value}
                    onClick={() => setResolution(item.value)}
                  >
                    {item.label}
                  </PillButton>
                ))}
              </div>
            </OptionGroup>
            <OptionGroup label="Seedance Duration">
              <div className="grid grid-cols-4 gap-2">
                {DURATIONS.map((item) => (
                  <PillButton
                    key={item.value}
                    isSelected={seedanceDuration === item.value}
                    onClick={() => setSeedanceDuration(item.value)}
                  >
                    {item.label}
                  </PillButton>
                ))}
              </div>
            </OptionGroup>
          </div>

          <div className="flex items-center justify-between rounded-xl border-2 border-coco-beige-dark bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-coco-brown">Full Access</p>
              <p className="mt-1 text-xs text-coco-brown-medium/60">
                Keep enabled for human faces and influencer/avatar generation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFullAccess(!fullAccess)}
              className={cn("flex h-6 w-11 items-center rounded-full transition-colors", fullAccess ? "bg-coco-golden" : "bg-coco-beige-dark")}
            >
              <div className={cn("h-5 w-5 rounded-full bg-white shadow transition-transform", fullAccess ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </div>

          {enhancorMode === "ugc" && (
            <div className="space-y-3 rounded-xl border-2 border-coco-beige-dark bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-coco-brown">UGC Inputs</p>
                <p className="mt-1 text-xs text-coco-brown-medium/60">
                  The selected product and avatar are sent by default. Add optional extra product or influencer image URLs below.
                </p>
              </div>
              <UrlTextarea
                label="Extra product URLs"
                value={ugcProductsText}
                onChange={setUgcProductsText}
                placeholder="https://example.com/second-product.png"
              />
              <UrlTextarea
                label="Extra influencer URLs"
                value={ugcInfluencersText}
                onChange={setUgcInfluencersText}
                placeholder="https://example.com/second-influencer.png"
              />
            </div>
          )}

          {/* Mode-specific inputs */}
          {enhancorMode !== "ugc" && enhancorMode !== "text-to-video" && (
            <div className="space-y-3 rounded-xl border-2 border-coco-beige-dark bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-coco-brown">Mode-specific References</p>
                <p className="mt-1 text-xs text-coco-brown-medium/60">
                  Add public URLs, one per line. The selected avatar/product are included automatically where useful.
                </p>
              </div>

              {(enhancorMode === "multi_reference" || enhancorMode === "lipsyncing") && (
                <UrlTextarea
                  label="Extra images"
                  value={referenceImagesText}
                  onChange={setReferenceImagesText}
                  placeholder="https://example.com/reference-1.png"
                />
              )}

              {(enhancorMode === "multi_reference" ||
                enhancorMode === "lipsyncing" ||
                enhancorMode === "first_n_last_frames" ||
                enhancorMode === "multi_frame") && (
                <UrlTextarea
                  label="Reference videos"
                  value={referenceVideosText}
                  onChange={setReferenceVideosText}
                  placeholder="https://example.com/reference-motion.mp4"
                />
              )}

              {(enhancorMode === "multi_reference" ||
                enhancorMode === "lipsyncing" ||
                enhancorMode === "first_n_last_frames" ||
                enhancorMode === "multi_frame") && (
                <UrlTextarea
                  label="Reference audios"
                  value={referenceAudiosText}
                  onChange={setReferenceAudiosText}
                  placeholder="https://example.com/voiceover.mp3"
                />
              )}

              {enhancorMode === "first_n_last_frames" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <UrlInput
                    label="First frame image"
                    value={firstFrameImage}
                    onChange={setFirstFrameImage}
                    placeholder="Defaults to selected avatar image"
                  />
                  <UrlInput
                    label="Last frame image"
                    value={lastFrameImage}
                    onChange={setLastFrameImage}
                    placeholder="https://example.com/end-frame.png"
                  />
                </div>
              )}

              {enhancorMode === "lipsyncing" && (
                <UrlInput
                  label="Dedicated lip-sync audio"
                  value={lipsyncingAudio}
                  onChange={setLipsyncingAudio}
                  placeholder="Defaults to uploaded audio if available"
                />
              )}

              {enhancorMode === "multi_frame" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-coco-brown">Multi-frame prompts</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setMultiFramePrompts((prev) => [
                          ...prev,
                          { prompt: "", duration: 5 },
                        ])
                      }
                      className="h-8 text-xs"
                    >
                      Add frame
                    </Button>
                  </div>
                  {multiFramePrompts.map((item, index) => (
                    <div key={index} className="grid gap-2 rounded-lg bg-coco-beige/30 p-3 sm:grid-cols-[1fr_90px_auto]">
                      <input
                        value={item.prompt}
                        onChange={(event) =>
                          updateMultiFramePrompt(index, {
                            ...item,
                            prompt: event.target.value,
                          })
                        }
                        placeholder={`Frame ${index + 1} prompt`}
                        className="rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none focus:border-coco-golden"
                      />
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={item.duration}
                        onChange={(event) =>
                          updateMultiFramePrompt(index, {
                            ...item,
                            duration: Number(event.target.value),
                          })
                        }
                        className="rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none focus:border-coco-golden"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setMultiFramePrompts((prev) =>
                            prev.filter((_, frameIndex) => frameIndex !== index)
                          )
                        }
                        className="rounded-lg px-2 text-xs font-medium text-red-500 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aspect ratio */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-3">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.value}
                  type="button"
                  onClick={() => setAspectRatio(ar.value)}
                  className={cn(
                    "rounded-xl border-2 py-3 text-center transition-all",
                    aspectRatio === ar.value
                      ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                      : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                  )}
                >
                  <p className={cn("text-sm font-bold", aspectRatio === ar.value ? "text-coco-golden" : "text-coco-brown-medium")}>{ar.label}</p>
                  <p className="text-[10px] text-coco-brown-medium/60">{ar.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Fixed lens toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFixedLens(!fixedLens)}
              className={cn("flex h-5 w-9 items-center rounded-full transition-colors", fixedLens ? "bg-coco-golden" : "bg-coco-beige-dark")}
            >
              <div className={cn("h-4 w-4 rounded-full bg-white shadow transition-transform", fixedLens ? "translate-x-4" : "translate-x-0.5")} />
            </button>
            <div className="flex items-center gap-1.5">
              {fixedLens ? <Lock className="h-3.5 w-3.5 text-coco-golden" /> : <Unlock className="h-3.5 w-3.5 text-coco-brown-medium/40" />}
              <span className="text-xs text-coco-brown-medium">Lock camera (static shot)</span>
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-coco-golden" />
                <p className="text-sm font-semibold text-coco-brown">Estimated Cost</p>
              </div>
              <span className="text-lg font-bold text-coco-golden">${seedanceCost.total.toFixed(2)}</span>
            </div>
            <div className="mt-3 space-y-1.5">
              <CostRow label="Script generation" value={seedanceCost.scriptGeneration} />
              <CostRow label="UGC avatar image" value={seedanceCost.imageComposition} />
              <CostRow label={`Seedance 2.0 (${seedanceDuration}s)`} value={seedanceCost.videoGeneration} />
              <CostRow label="Post-processing" value={seedanceCost.postProcessing} />
            </div>
            <div className="mt-3 border-t border-coco-golden/20 pt-3">
              <p className="text-[11px] text-coco-brown-medium/50">
                HeyGen pipeline: ~${heygenCost.total.toFixed(2)} (polished studio style) · Seedance: ~${seedanceCost.total.toFixed(2)} (authentic UGC style)
              </p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-coco-brown-medium/40" />
              <p className="text-xs text-coco-brown-medium/60">Estimated time: 2–4 minutes</p>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            className="w-full gap-2 bg-coco-golden py-6 text-base font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl"
            size="lg"
          >
            <Sparkles className="h-5 w-5" />
            Generate UGC Video
          </Button>
        </>
      )}

      {/* Processing */}
      {isGenerating && (
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-coco-golden/20 bg-white p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
              <Loader2 className="h-8 w-8 animate-spin text-coco-golden" />
            </div>
            <p className="mt-4 text-sm font-semibold text-coco-brown">{STATUS_LABELS[status ?? "pending"]}</p>
            <p className="mt-1 text-xs text-coco-brown-medium/50">{STEP_LABELS[pipelineStep]}</p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-coco-beige">
              <div className="h-full rounded-full bg-coco-golden transition-all duration-1000" style={{ width: `${Math.max(progress, 10)}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-coco-brown-medium/40">Usually takes 2–4 minutes. Don&apos;t close this page.</p>
          </div>
          <div className="space-y-2">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  {i < pipelineStep ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden"><Check className="h-3 w-3 text-white" /></div>
                  ) : i === pipelineStep ? (
                    <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
                  ) : (
                    <div className="h-6 w-6 rounded-full border-2 border-coco-beige-dark" />
                  )}
                </div>
                <span className="text-xs text-coco-brown-medium/70">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isGenerating && (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-red-200 bg-red-50/50 p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100"><X className="h-6 w-6 text-red-500" /></div>
            <p className="mt-3 text-sm font-semibold text-coco-brown">Generation Failed</p>
            <p className="mt-1 text-center text-xs text-coco-brown-medium/60">{error}</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleGenerate} className="flex-1 gap-2 bg-coco-golden py-5 text-sm font-semibold text-white hover:bg-coco-golden-dark" size="lg">
              <RefreshCw className="h-4 w-4" />Try Again
            </Button>
            <Button onClick={onReset} variant="outline" className="flex-1 py-5 text-sm" size="lg">Start Over</Button>
          </div>
        </div>
      )}

      {/* Success */}
      {finalVideoUrl && !isGenerating && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border-2 border-coco-golden/30 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-coco-beige-dark px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-coco-brown">
                <Film className="h-4 w-4 text-coco-golden" />Your UGC Video is Ready!
              </span>
              <span className="flex h-5 items-center rounded-full bg-green-100 px-2 text-[10px] font-medium text-green-700">
                <Check className="mr-1 h-3 w-3" />Complete
              </span>
            </div>
            <div className="aspect-video bg-black">
              <video src={finalVideoUrl} poster={thumbnailUrl ?? undefined} controls className="h-full w-full" preload="metadata" />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => { if (videoId) window.open(`/api/videos/${videoId}/download`, "_blank"); }}
              className="flex-1 gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg hover:bg-coco-golden-dark" size="lg"
            >
              <Download className="h-4 w-4" />Download Video
            </Button>
            <Button onClick={onReset} variant="outline" className="flex-1 py-5 text-sm" size="lg">
              <Sparkles className="mr-2 h-4 w-4" />Create Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-coco-brown-medium/60">{label}</span>
      <span className="text-xs font-medium text-coco-brown">{value}</span>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-coco-brown-medium/50">{label}</span>
      <span className="text-[11px] font-medium text-coco-brown-medium">${value.toFixed(4)}</span>
    </div>
  );
}

function parseUrlList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getModeTitle(mode: EnhancorUiMode): string {
  return ENHANCOR_MODES.find((item) => item.value === mode)?.title ?? mode;
}

function OptionGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">{label}</label>
      {children}
    </div>
  );
}

function PillButton({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 py-2 text-center text-xs font-bold transition-all",
        isSelected
          ? "border-coco-golden bg-coco-golden/10 text-coco-golden"
          : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
      )}
    >
      {children}
    </button>
  );
}

function UrlTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-coco-brown">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none transition-colors placeholder:text-coco-brown-medium/30 focus:border-coco-golden"
      />
    </div>
  );
}

function UrlInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-coco-brown">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none transition-colors placeholder:text-coco-brown-medium/30 focus:border-coco-golden"
      />
    </div>
  );
}
