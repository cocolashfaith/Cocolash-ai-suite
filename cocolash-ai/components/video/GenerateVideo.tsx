"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
} from "lucide-react";
import { calculateVideoCost, type VideoCostEstimate } from "@/lib/costs/tracker";
import type {
  ScriptResult,
  CompositionPose,
  VideoAspectRatio,
  VideoBackgroundType,
  HeyGenVideoStatus,
} from "@/lib/types";

interface GenerateVideoProps {
  script: ScriptResult;
  editedScriptText?: string;
  personImageUrl: string;
  personImageId?: string;
  productImageUrl: string;
  pose: CompositionPose;
  voiceId: string;
  aspectRatio: VideoAspectRatio;
  backgroundType: VideoBackgroundType;
  backgroundValue: string;
  addCaptions: boolean;
  addWatermark: boolean;
  musicTrackId: string | null;
  campaignType: string;
  tone: string;
  duration: number;
  onReset: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing...",
  processing: "Generating video...",
  completed: "Complete!",
  failed: "Failed",
};

const STEP_LABELS = [
  "Composing avatar image...",
  "Uploading to HeyGen...",
  "Generating video...",
  "Processing & applying effects...",
];

export function GenerateVideo(props: GenerateVideoProps) {
  const {
    script,
    editedScriptText,
    personImageUrl,
    personImageId,
    productImageUrl,
    pose,
    voiceId,
    aspectRatio,
    backgroundType,
    backgroundValue,
    addCaptions,
    addWatermark,
    musicTrackId,
    campaignType,
    tone,
    duration,
    onReset,
  } = props;

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
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const pollStatus = useCallback(
    (id: string) => {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/videos/${id}/status`);
          const data = await res.json();

          if (!res.ok) return;

          setStatus(data.status);
          setProgress(data.progress ?? 0);

          if (data.status === "processing") {
            setPipelineStep(2);
          }

          if (data.status === "completed") {
            stopPolling();
            setFinalVideoUrl(data.finalVideoUrl ?? null);
            setThumbnailUrl(data.thumbnailUrl ?? null);
            setPipelineStep(3);
            setIsGenerating(false);
            toast.success("Video generated successfully!");
          }

          if (data.status === "failed") {
            stopPolling();
            setError(data.error ?? "Video generation failed");
            setIsGenerating(false);
            toast.error("Video generation failed");
          }
        } catch {
          // Silently retry on next interval
        }
      }, 10000);
    },
    [stopPolling]
  );

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
      setPipelineStep(0);

      const res = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignType,
          tone,
          duration,
          personImageUrl,
          personImageId,
          productImageUrl,
          pose,
          voiceId,
          aspectRatio,
          backgroundType,
          backgroundValue,
          addCaptions,
          addWatermark,
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
      toast.success("Video submitted! Generating...");

      pollStatus(data.videoId);
    } catch {
      setError("Network error — please try again.");
      setStatus("failed");
      setIsGenerating(false);
      toast.error("Network error");
    }
  };

  const handleDownload = () => {
    if (!videoId) return;
    window.open(`/api/videos/${videoId}/download`, "_blank");
  };

  const scriptText = editedScriptText || script.full_script;

  return (
    <div className="space-y-6">
      {/* Summary */}
      {!isGenerating && !finalVideoUrl && !error && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">
              Video Summary
            </label>
            <div className="space-y-2 rounded-xl border-2 border-coco-beige-dark bg-white p-4">
              <SummaryRow label="Campaign" value={campaignType} />
              <SummaryRow label="Tone" value={tone} />
              <SummaryRow label="Duration" value={`${duration}s`} />
              <SummaryRow label="Pose" value={pose} />
              <SummaryRow label="Aspect Ratio" value={aspectRatio} />
              <SummaryRow label="Background" value={backgroundValue} isColor />
              <SummaryRow label="Captions" value={addCaptions ? "Yes" : "No"} />
              <SummaryRow label="Watermark" value={addWatermark ? "Yes" : "No"} />
              <SummaryRow label="Music" value={musicTrackId ? "Selected" : "None"} />
            </div>
          </div>

          {/* Script Preview */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-coco-brown">Script</label>
            <div className="rounded-xl border-2 border-coco-beige-dark bg-white/60 p-4">
              <p className="line-clamp-4 whitespace-pre-wrap text-xs text-coco-brown-medium">
                {scriptText}
              </p>
            </div>
          </div>

          {/* Cost & Time Estimate */}
          <CostEstimateCard
            duration={duration}
            addCaptions={addCaptions}
            addWatermark={addWatermark}
          />

          <Button
            onClick={handleGenerate}
            className="w-full gap-2 bg-coco-golden py-6 text-base font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl"
            size="lg"
          >
            <Sparkles className="h-5 w-5" />
            Generate Video
          </Button>
        </>
      )}

      {/* Processing Status */}
      {isGenerating && (
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-coco-golden/20 bg-white p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
              <Loader2 className="h-8 w-8 animate-spin text-coco-golden" />
            </div>
            <p className="mt-4 text-sm font-semibold text-coco-brown">
              {STATUS_LABELS[status ?? "pending"]}
            </p>
            <p className="mt-1 text-xs text-coco-brown-medium/50">
              {STEP_LABELS[pipelineStep]}
            </p>

            {/* Progress bar */}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-coco-beige">
              <div
                className="h-full rounded-full bg-coco-golden transition-all duration-1000"
                style={{ width: `${Math.max(progress, 10)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-coco-brown-medium/40">
              Usually takes 3–5 minutes. Don&apos;t close this page.
            </p>
          </div>

          {/* Pipeline Steps */}
          <div className="space-y-2">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  {i < pipelineStep ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                      <Check className="h-3 w-3 text-white" />
                    </div>
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

      {/* Error State */}
      {error && !isGenerating && (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-red-200 bg-red-50/50 p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <X className="h-6 w-6 text-red-500" />
            </div>
            <p className="mt-3 text-sm font-semibold text-coco-brown">
              Generation Failed
            </p>
            <p className="mt-1 text-center text-xs text-coco-brown-medium/60">
              {error}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleGenerate}
              className="flex-1 gap-2 bg-coco-golden py-5 text-sm font-semibold text-white hover:bg-coco-golden-dark"
              size="lg"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button
              onClick={onReset}
              variant="outline"
              className="flex-1 py-5 text-sm"
              size="lg"
            >
              Start Over
            </Button>
          </div>
        </div>
      )}

      {/* Success / Video Preview */}
      {finalVideoUrl && !isGenerating && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border-2 border-coco-golden/30 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-coco-beige-dark px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-coco-brown">
                <Film className="h-4 w-4 text-coco-golden" />
                Your Video is Ready!
              </span>
              <span className="flex h-5 items-center rounded-full bg-green-100 px-2 text-[10px] font-medium text-green-700">
                <Check className="mr-1 h-3 w-3" />
                Complete
              </span>
            </div>

            <div className="aspect-video bg-black">
              <video
                src={finalVideoUrl}
                poster={thumbnailUrl ?? undefined}
                controls
                className="h-full w-full"
                preload="metadata"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleDownload}
              className="flex-1 gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg hover:bg-coco-golden-dark"
              size="lg"
            >
              <Download className="h-4 w-4" />
              Download Video
            </Button>
            <Button
              onClick={onReset}
              variant="outline"
              className="flex-1 py-5 text-sm"
              size="lg"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Create Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  isColor,
}: {
  label: string;
  value: string;
  isColor?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-coco-brown-medium/60">{label}</span>
      <span className="flex items-center gap-2 text-xs font-medium text-coco-brown">
        {isColor && (
          <span
            className="inline-block h-4 w-4 rounded-full border border-coco-beige-dark"
            style={{ backgroundColor: value }}
          />
        )}
        {isColor ? "" : value}
      </span>
    </div>
  );
}

function CostEstimateCard({
  duration,
  addCaptions,
  addWatermark,
}: {
  duration: number;
  addCaptions: boolean;
  addWatermark: boolean;
}) {
  const estimate: VideoCostEstimate = calculateVideoCost({
    duration,
    addCaptions,
    addWatermark,
    needsScriptGeneration: true,
  });

  return (
    <div className="rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-coco-golden" />
          <p className="text-sm font-semibold text-coco-brown">
            Estimated Cost
          </p>
        </div>
        <span className="text-lg font-bold text-coco-golden">
          ${estimate.total.toFixed(2)}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <CostRow label="Script Generation" value={estimate.scriptGeneration} />
        <CostRow label="Image Composition" value={estimate.imageComposition} />
        <CostRow label="Video Generation (HeyGen)" value={estimate.videoGeneration} />
        <CostRow label="Post-Processing" value={estimate.postProcessing} />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-coco-golden/20 pt-3">
        <Clock className="h-3.5 w-3.5 text-coco-brown-medium/40" />
        <p className="text-xs text-coco-brown-medium/60">
          Estimated time: 3–5 minutes
        </p>
      </div>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-coco-brown-medium/50">{label}</span>
      <span className="text-[11px] font-medium text-coco-brown-medium">
        ${value.toFixed(4)}
      </span>
    </div>
  );
}
