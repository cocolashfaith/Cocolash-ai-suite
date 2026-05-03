"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { SeedanceV4WizardState } from "../types";

interface FirstAndLastFrameModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

/**
 * First+Last frame mode — uses the NanoBanana Last-Frame Director chain
 * (POST /api/seedance/last-frame action: "generate") to produce a
 * destination frame that's environmentally consistent with the first frame.
 * The user provides:
 *   1. A first-frame URL (from a UGC avatar OR a fresh upload)
 *   2. A free-text destination description
 * Then clicks "Generate Last Frame" — Claude writes the prompt, NanoBanana
 * generates the image, the user can review / regenerate before continuing.
 */
export function FirstAndLastFrameMode({
  state,
  setState,
  onReady,
}: FirstAndLastFrameModeProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const filename = `seedance-first-frame/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("brand-assets")
        .upload(filename, file, {
          contentType: file.type,
          cacheControl: "3600",
        });
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from("brand-assets").getPublicUrl(filename);
      setState({ firstFrameUrl: publicUrl, lastFrameUrl: undefined, lastFramePrompt: undefined });
      toast.success("First frame uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleGenerateLastFrame() {
    if (!state.firstFrameUrl) {
      toast.error("Upload a first frame first");
      return;
    }
    const desc = state.lastFrameDescription?.trim();
    if (!desc) {
      toast.error("Describe the destination scene");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/seedance/last-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          firstFrameImageUrl: state.firstFrameUrl,
          destinationDescription: desc,
          campaignType: state.campaignType,
          aspectRatio: state.aspectRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Last-frame generation failed");
      }
      setState({
        lastFrameUrl: data.imageUrl,
        lastFramePrompt: data.imagePrompt,
      });
      toast.success("Last frame generated.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Last-frame generation failed"
      );
    } finally {
      setGenerating(false);
    }
  }

  const canContinue = !!state.firstFrameUrl && !!state.lastFrameUrl;

  return (
    <div className="space-y-6">
      {/* First frame */}
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-coco-brown">First frame</h3>
          <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
            Upload the OPENING image of the video. (You can also use a UGC
            avatar generated in another mode — just upload a copy here.)
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
        />
        {state.firstFrameUrl ? (
          <div className="relative inline-block overflow-hidden rounded-xl border-2 border-coco-golden/30 bg-white">
            <img
              src={state.firstFrameUrl}
              alt="First frame"
              className="max-h-64 w-auto object-contain"
            />
            <button
              type="button"
              onClick={() =>
                setState({
                  firstFrameUrl: undefined,
                  lastFrameUrl: undefined,
                  lastFramePrompt: undefined,
                })
              }
              className="absolute right-1 top-1 rounded-full bg-white/80 p-1 hover:bg-white"
            >
              <X className="h-3 w-3 text-coco-brown-medium" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-coco-beige-dark bg-white p-6 transition-colors hover:border-coco-golden/40"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
            ) : (
              <>
                <Upload className="h-5 w-5 text-coco-brown-medium/30" />
                <span className="text-xs font-medium text-coco-brown-medium">
                  Upload first frame
                </span>
              </>
            )}
          </button>
        )}
      </section>

      {/* Destination description + AI generation */}
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-coco-brown">
            Describe the destination scene
          </h3>
          <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
            Required. The Last-Frame Director (Claude Opus 4.7) will read your
            first frame and your description, then NanoBanana will generate
            the last frame with environmental consistency (lighting, palette,
            framing carry over).
          </p>
        </div>
        <textarea
          value={state.lastFrameDescription ?? ""}
          onChange={(e) =>
            setState({
              lastFrameDescription: e.target.value,
              // Invalidate the previously generated last frame if the description changed
              lastFrameUrl: undefined,
              lastFramePrompt: undefined,
            })
          }
          rows={3}
          placeholder="e.g. The same creator is now holding the open product box with both hands at chest height, smiling at the camera."
          className="w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-xs text-coco-brown outline-none focus:border-coco-golden"
        />

        <Button
          onClick={handleGenerateLastFrame}
          disabled={
            !state.firstFrameUrl ||
            !state.lastFrameDescription?.trim() ||
            generating
          }
          className="w-full gap-2 bg-coco-brown py-5 text-sm font-semibold text-white shadow-md hover:bg-coco-brown-light disabled:opacity-50"
          size="lg"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating last frame…
            </>
          ) : state.lastFrameUrl ? (
            <>
              <Wand2 className="h-4 w-4" />
              Regenerate Last Frame
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Generate Last Frame with NanoBanana
            </>
          )}
        </Button>

        {state.lastFrameUrl && (
          <div className="space-y-2 overflow-hidden rounded-xl border-2 border-coco-golden/30 bg-white">
            <div className="flex items-center justify-between border-b border-coco-beige px-3 py-2">
              <p className="text-xs font-semibold text-coco-brown">
                Generated last frame
              </p>
              <p className="text-[10px] text-coco-brown-medium/50">
                Not right? Refine the description and regenerate.
              </p>
            </div>
            <div className="bg-coco-beige-light p-2">
              <img
                src={state.lastFrameUrl}
                alt="Last frame"
                className="mx-auto max-h-64 object-contain"
              />
            </div>
            {state.lastFramePrompt && (
              <details className="border-t border-coco-beige px-3 py-2">
                <summary className="cursor-pointer text-[10px] font-medium text-coco-brown-medium/60">
                  View the image prompt the Director wrote
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-[11px] text-coco-brown-medium">
                  {state.lastFramePrompt}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>

      <Button
        onClick={onReady}
        disabled={!canContinue}
        className={cn(
          "w-full gap-2 py-5 text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-50",
          "bg-coco-golden hover:bg-coco-golden-dark hover:shadow-xl"
        )}
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}
