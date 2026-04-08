"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import type { SeedanceAspectRatio } from "@/lib/seedance/types";
import type { SeedanceAudioMode } from "@/lib/seedance/types";
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

const ASPECT_RATIOS: { value: SeedanceAspectRatio; label: string; desc: string }[] = [
  { value: "9:16", label: "9:16", desc: "TikTok / Reels" },
  { value: "1:1", label: "1:1", desc: "Square" },
  { value: "16:9", label: "16:9", desc: "Landscape" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing...",
  processing: "Generating UGC video...",
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
    } catch {
      setError("Network error — please try again.");
      setStatus("failed");
      setIsGenerating(false);
      toast.error("Network error");
    }
  };

  const scriptText = editedScriptText || script.full_script;
  const seedanceDuration = duration <= 5 ? 5 : duration <= 8 ? 8 : duration <= 10 ? 10 : 15;

  const seedanceCost = calculateSeedanceCost({
    duration: seedanceDuration,
    includeScript: true,
    includeImageGen: true,
    includePostProcessing: true,
  });

  const heygenCost = calculateVideoCost({
    duration: seedanceDuration,
    addCaptions: true,
    addWatermark: true,
    needsScriptGeneration: true,
  });

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
