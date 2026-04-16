"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FileText,
  User,
  Palette,
  Film,
  Check,
  Images,
  Loader2,
  ArrowLeft,
  Sparkles,
  Smartphone,
} from "lucide-react";
import { ScriptGenerator } from "@/components/video/ScriptGenerator";
import { AvatarSetup } from "@/components/video/AvatarSetup";
import { VoiceAndStyle } from "@/components/video/VoiceAndStyle";
import { GenerateVideo } from "@/components/video/GenerateVideo";
import { PipelineSelector } from "@/components/video/PipelineSelector";
import { SeedanceScriptStep } from "@/components/video/seedance/SeedanceScriptStep";
import { SeedanceAvatarStep } from "@/components/video/seedance/SeedanceAvatarStep";
import { SeedanceGenerateStep } from "@/components/video/seedance/SeedanceGenerateStep";
import type {
  ScriptResult,
  CampaignType,
  ScriptTone,
  VideoDuration,
  CompositionPose,
  VideoAspectRatio,
  VideoPipeline,
  CaptionMethod,
} from "@/lib/types";
import type { SeedanceAudioMode } from "@/lib/seedance/types";
import type { UGCScene, UGCVibe } from "@/lib/seedance/ugc-image-prompt";

// ── HeyGen Wizard Steps ──────────────────────────────────────

const HEYGEN_STEPS = [
  { label: "Script", icon: FileText },
  { label: "Avatar", icon: User },
  { label: "Style", icon: Palette },
  { label: "Generate", icon: Film },
];

// ── Seedance Wizard Steps ────────────────────────────────────

const SEEDANCE_STEPS = [
  { label: "Script", icon: FileText },
  { label: "Avatar + Product", icon: Smartphone },
  { label: "Generate", icon: Sparkles },
];

// ── HeyGen Wizard State ──────────────────────────────────────

interface HeyGenWizardState {
  script: ScriptResult | null;
  editedScriptText?: string;
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: VideoDuration;
  personImageUrl: string | null;
  personImageId?: string;
  productImageUrl: string | null;
  composedImageUrl: string | null;
  pose: CompositionPose;
  voiceId: string | null;
  aspectRatio: VideoAspectRatio;
  captionMethod: CaptionMethod;
  /** Skip Gemini compose on /api/videos/generate — use composedImageUrl as-is */
  preComposed: boolean;
}

const DEFAULT_HEYGEN_STATE: HeyGenWizardState = {
  script: null,
  campaignType: "educational",
  tone: "casual",
  duration: 30,
  personImageUrl: null,
  productImageUrl: null,
  composedImageUrl: null,
  pose: "holding",
  voiceId: null,
  aspectRatio: "9:16",
  captionMethod: "ffmpeg-burn",
  preComposed: false,
};

// ── Seedance Wizard State ────────────────────────────────────

interface SeedanceWizardState {
  script: ScriptResult | null;
  editedScriptText?: string;
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: VideoDuration;
  personImageUrl: string | null;
  productImageUrl: string | null;
  audioMode: SeedanceAudioMode;
  audioUrl?: string;
  scene: UGCScene;
  vibe: UGCVibe;
  personDescription: string;
}

const DEFAULT_SEEDANCE_STATE: SeedanceWizardState = {
  script: null,
  campaignType: "product-showcase",
  tone: "casual",
  duration: 15,
  personImageUrl: null,
  productImageUrl: null,
  audioMode: "script-in-prompt",
  scene: "casual-bedroom",
  vibe: "excited-discovery",
  personDescription: "",
};

// ── Page ─────────────────────────────────────────────────────

export default function VideoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-coco-golden" />
        </div>
      }
    >
      <VideoWizard />
    </Suspense>
  );
}

function VideoWizard() {
  const searchParams = useSearchParams();
  const initialImageId = searchParams.get("imageId") ?? undefined;
  const initialImageUrl = searchParams.get("imageUrl")
    ? decodeURIComponent(searchParams.get("imageUrl")!)
    : undefined;

  const [pipeline, setPipeline] = useState<"select" | VideoPipeline>("select");

  // ── HeyGen state ──────────────────────────────────
  const [heygenStep, setHeygenStep] = useState(0);
  const [heygenState, setHeygenState] = useState<HeyGenWizardState>({
    ...DEFAULT_HEYGEN_STATE,
    personImageUrl: initialImageUrl ?? null,
    personImageId: initialImageId,
  });

  // ── Seedance state ────────────────────────────────
  const [seedanceStep, setSeedanceStep] = useState(0);
  const [seedanceState, setSeedanceState] = useState<SeedanceWizardState>({
    ...DEFAULT_SEEDANCE_STATE,
  });

  // ── Pipeline selection ────────────────────────────
  const handleSelectPipeline = (p: VideoPipeline) => {
    setPipeline(p);
  };

  const handleBackToPipelineSelect = () => {
    setPipeline("select");
    setHeygenStep(0);
    setSeedanceStep(0);
    setHeygenState({
      ...DEFAULT_HEYGEN_STATE,
      personImageUrl: initialImageUrl ?? null,
      personImageId: initialImageId,
    });
    setSeedanceState({ ...DEFAULT_SEEDANCE_STATE });
  };

  // ── HeyGen callbacks ─────────────────────────────
  const handleHeygenScriptSelected = (
    script: ScriptResult,
    meta: { campaignType: CampaignType; tone: ScriptTone; duration: VideoDuration },
    editedText?: string
  ) => {
    setHeygenState((prev) => ({
      ...prev,
      script,
      editedScriptText: editedText,
      campaignType: meta.campaignType,
      tone: meta.tone,
      duration: meta.duration,
    }));
    setHeygenStep(1);
  };

  const handleHeygenCompositionReady = (data: {
    personImageUrl: string;
    personImageId?: string;
    productImageUrl: string;
    composedImageUrl: string;
    pose: CompositionPose;
    preComposed?: boolean;
    skipComposition?: boolean;
  }) => {
    setHeygenState((prev) => ({
      ...prev,
      personImageUrl: data.personImageUrl,
      personImageId: data.personImageId,
      productImageUrl: data.skipComposition ? null : data.productImageUrl,
      composedImageUrl: data.composedImageUrl,
      pose: data.pose,
      preComposed: data.preComposed ?? false,
    }));
    setHeygenStep(2);
  };

  const handleHeygenStyleReady = (data: {
    voiceId: string;
    aspectRatio: VideoAspectRatio;
    captionMethod: CaptionMethod;
  }) => {
    setHeygenState((prev) => ({
      ...prev,
      voiceId: data.voiceId,
      aspectRatio: data.aspectRatio,
      captionMethod: data.captionMethod,
    }));
    setHeygenStep(3);
  };

  const handleHeygenReset = () => {
    setHeygenState({
      ...DEFAULT_HEYGEN_STATE,
      personImageUrl: initialImageUrl ?? null,
      personImageId: initialImageId,
    });
    setHeygenStep(0);
  };

  // ── Seedance callbacks ────────────────────────────
  const handleSeedanceScriptSelected = (
    script: ScriptResult,
    meta: { campaignType: CampaignType; tone: ScriptTone; duration: VideoDuration },
    editedText?: string
  ) => {
    setSeedanceState((prev) => ({
      ...prev,
      script,
      editedScriptText: editedText,
      campaignType: meta.campaignType,
      tone: meta.tone,
      duration: meta.duration,
    }));
    setSeedanceStep(1);
  };

  const handleSeedanceAvatarReady = (data: {
    personImageUrl: string;
    productImageUrl: string;
    audioMode: SeedanceAudioMode;
    audioUrl?: string;
    scene: UGCScene;
    vibe: UGCVibe;
    personDescription: string;
  }) => {
    setSeedanceState((prev) => ({
      ...prev,
      personImageUrl: data.personImageUrl,
      productImageUrl: data.productImageUrl,
      audioMode: data.audioMode,
      audioUrl: data.audioUrl,
      scene: data.scene,
      vibe: data.vibe,
      personDescription: data.personDescription,
    }));
    setSeedanceStep(2);
  };

  const handleSeedanceReset = () => {
    setSeedanceState(DEFAULT_SEEDANCE_STATE);
    setSeedanceStep(0);
  };

  // ── Determine current steps for progress bar ──────
  const currentSteps = pipeline === "heygen" ? HEYGEN_STEPS : SEEDANCE_STEPS;
  const currentStep = pipeline === "heygen" ? heygenStep : seedanceStep;
  const setCurrentStep = pipeline === "heygen" ? setHeygenStep : setSeedanceStep;

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3">
              {pipeline !== "select" && (
                <button
                  type="button"
                  onClick={handleBackToPipelineSelect}
                  className="flex items-center gap-1 text-xs font-medium text-coco-brown-medium/50 transition-colors hover:text-coco-brown"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              )}
              <h1 className="text-2xl font-bold text-coco-brown">
                {pipeline === "select"
                  ? "Create Video"
                  : pipeline === "heygen"
                    ? "Brand Content Studio"
                    : "Create Video — Seedance 2.0"}
              </h1>
            </div>
            <p className="mt-1 text-sm text-coco-brown-medium">
              {pipeline === "select"
                ? "Choose your video generation engine"
                : pipeline === "heygen"
                  ? "Educational videos, tutorials & brand storytelling"
                  : "Authentic UGC-style videos for TikTok & Reels"}
            </p>
          </div>
          <Link
            href="/video/gallery"
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-coco-brown-medium shadow-sm transition-all hover:bg-coco-beige-light hover:text-coco-brown"
          >
            <Images className="h-3.5 w-3.5" />
            View Gallery
          </Link>
        </div>
      </div>

      {/* Pipeline Selector */}
      {pipeline === "select" && (
        <div className="mx-auto max-w-2xl">
          <PipelineSelector onSelect={handleSelectPipeline} />
        </div>
      )}

      {/* Progress Steps (HeyGen or Seedance) */}
      {pipeline !== "select" && (
        <>
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {currentSteps.map((step, i) => {
                const Icon = step.icon;
                const isCompleted = i < currentStep;
                const isActive = i === currentStep;

                return (
                  <div key={step.label} className="flex flex-1 items-center">
                    <button
                      type="button"
                      onClick={() => { if (i < currentStep) setCurrentStep(i); }}
                      disabled={i > currentStep}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                          isCompleted
                            ? "border-coco-golden bg-coco-golden text-white"
                            : isActive
                              ? "border-coco-golden bg-coco-golden/10 text-coco-golden"
                              : "border-coco-beige-dark bg-white text-coco-brown-medium/40"
                        )}
                      >
                        {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          isActive ? "text-coco-golden" : isCompleted ? "text-coco-brown" : "text-coco-brown-medium/40"
                        )}
                      >
                        {step.label}
                      </span>
                    </button>

                    {i < currentSteps.length - 1 && (
                      <div className="mx-2 mt-[-18px] h-[2px] flex-1">
                        <div className={cn("h-full rounded-full transition-colors", i < currentStep ? "bg-coco-golden" : "bg-coco-beige-dark")} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mx-auto max-w-2xl">
            {/* ── HeyGen Wizard Steps ─────────────── */}
            {pipeline === "heygen" && (
              <>
                {heygenStep === 0 && (
                  <ScriptGenerator onScriptSelected={handleHeygenScriptSelected} />
                )}
                {heygenStep === 1 && (
                  <AvatarSetup
                    campaignType={heygenState.campaignType}
                    aspectRatio={heygenState.aspectRatio}
                    onAspectRatioChange={(ratio) =>
                      setHeygenState((prev) => ({ ...prev, aspectRatio: ratio }))
                    }
                    initialPersonImageUrl={initialImageUrl}
                    initialPersonImageId={initialImageId}
                    onCompositionReady={handleHeygenCompositionReady}
                  />
                )}
                {heygenStep === 2 && (
                  <VoiceAndStyle
                    initialAspectRatio={heygenState.aspectRatio}
                    isEducational={["educational", "brand-story", "faq", "product-knowledge"].includes(heygenState.campaignType)}
                    onStyleReady={handleHeygenStyleReady}
                  />
                )}
                {heygenStep === 3 && heygenState.script && (
                  <GenerateVideo
                    script={heygenState.script}
                    editedScriptText={heygenState.editedScriptText}
                    personImageUrl={heygenState.personImageUrl!}
                    personImageId={heygenState.personImageId}
                    productImageUrl={heygenState.productImageUrl}
                    pose={heygenState.pose}
                    voiceId={heygenState.voiceId!}
                    aspectRatio={heygenState.aspectRatio}
                    composedImageUrl={heygenState.composedImageUrl}
                    usePrecomposedImage={heygenState.preComposed}
                    campaignType={heygenState.campaignType}
                    tone={heygenState.tone}
                    duration={heygenState.duration}
                    captionMethod={heygenState.captionMethod}
                    onReset={handleHeygenReset}
                  />
                )}
              </>
            )}

            {/* ── Seedance Wizard Steps ───────────── */}
            {pipeline === "seedance" && (
              <>
                {seedanceStep === 0 && (
                  <SeedanceScriptStep onScriptSelected={handleSeedanceScriptSelected} />
                )}
                {seedanceStep === 1 && (
                  <SeedanceAvatarStep
                    initialPersonImageUrl={initialImageUrl}
                    onAvatarReady={handleSeedanceAvatarReady}
                  />
                )}
                {seedanceStep === 2 && seedanceState.script && (
                  <SeedanceGenerateStep
                    script={seedanceState.script}
                    editedScriptText={seedanceState.editedScriptText}
                    campaignType={seedanceState.campaignType}
                    tone={seedanceState.tone}
                    duration={seedanceState.duration}
                    personImageUrl={seedanceState.personImageUrl!}
                    productImageUrl={seedanceState.productImageUrl!}
                    audioMode={seedanceState.audioMode}
                    audioUrl={seedanceState.audioUrl}
                    scene={seedanceState.scene}
                    vibe={seedanceState.vibe}
                    personDescription={seedanceState.personDescription}
                    onReset={handleSeedanceReset}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
