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
} from "lucide-react";
import { ScriptGenerator } from "@/components/video/ScriptGenerator";
import { AvatarSetup } from "@/components/video/AvatarSetup";
import { VoiceAndStyle } from "@/components/video/VoiceAndStyle";
import { GenerateVideo } from "@/components/video/GenerateVideo";
import type {
  ScriptResult,
  CampaignType,
  ScriptTone,
  VideoDuration,
  CompositionPose,
  VideoAspectRatio,
} from "@/lib/types";

const STEPS = [
  { label: "Script", icon: FileText },
  { label: "Avatar", icon: User },
  { label: "Style", icon: Palette },
  { label: "Generate", icon: Film },
];

interface WizardState {
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
}

const DEFAULT_STATE: WizardState = {
  script: null,
  campaignType: "product-showcase",
  tone: "casual",
  duration: 30,
  personImageUrl: null,
  productImageUrl: null,
  composedImageUrl: null,
  pose: "holding",
  voiceId: null,
  aspectRatio: "9:16",
};

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

  const [currentStep, setCurrentStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    ...DEFAULT_STATE,
    personImageUrl: initialImageUrl ?? null,
    personImageId: initialImageId,
  });

  const handleScriptSelected = (script: ScriptResult, editedText?: string) => {
    setState((prev) => ({
      ...prev,
      script,
      editedScriptText: editedText,
    }));
    setCurrentStep(1);
  };

  const handleCompositionReady = (data: {
    personImageUrl: string;
    personImageId?: string;
    productImageUrl: string;
    composedImageUrl: string;
    pose: CompositionPose;
  }) => {
    setState((prev) => ({
      ...prev,
      personImageUrl: data.personImageUrl,
      personImageId: data.personImageId,
      productImageUrl: data.productImageUrl,
      composedImageUrl: data.composedImageUrl,
      pose: data.pose,
    }));
    setCurrentStep(2);
  };

  const handleStyleReady = (data: {
    voiceId: string;
    aspectRatio: VideoAspectRatio;
  }) => {
    setState((prev) => ({
      ...prev,
      voiceId: data.voiceId,
      aspectRatio: data.aspectRatio,
    }));
    setCurrentStep(3);
  };

  const handleReset = () => {
    setState(DEFAULT_STATE);
    setCurrentStep(0);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-coco-brown">
              Create Video
            </h1>
            <p className="mt-1 text-sm text-coco-brown-medium">
              Generate AI avatar videos with custom scripts, voices & branding
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

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isCompleted = i < currentStep;
            const isActive = i === currentStep;

            return (
              <div key={step.label} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (i < currentStep) setCurrentStep(i);
                  }}
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
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isActive
                        ? "text-coco-golden"
                        : isCompleted
                          ? "text-coco-brown"
                          : "text-coco-brown-medium/40"
                    )}
                  >
                    {step.label}
                  </span>
                </button>

                {i < STEPS.length - 1 && (
                  <div className="mx-2 mt-[-18px] h-[2px] flex-1">
                    <div
                      className={cn(
                        "h-full rounded-full transition-colors",
                        i < currentStep ? "bg-coco-golden" : "bg-coco-beige-dark"
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="mx-auto max-w-2xl">
        {currentStep === 0 && (
          <ScriptGenerator onScriptSelected={handleScriptSelected} />
        )}

        {currentStep === 1 && (
          <AvatarSetup
            initialPersonImageUrl={initialImageUrl}
            initialPersonImageId={initialImageId}
            onCompositionReady={handleCompositionReady}
          />
        )}

        {currentStep === 2 && (
          <VoiceAndStyle onStyleReady={handleStyleReady} />
        )}

        {currentStep === 3 && state.script && (
          <GenerateVideo
            script={state.script}
            editedScriptText={state.editedScriptText}
            personImageUrl={state.personImageUrl!}
            personImageId={state.personImageId}
            productImageUrl={state.productImageUrl!}
            pose={state.pose}
            voiceId={state.voiceId!}
            aspectRatio={state.aspectRatio}
            campaignType={state.campaignType}
            tone={state.tone}
            duration={state.duration}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}
