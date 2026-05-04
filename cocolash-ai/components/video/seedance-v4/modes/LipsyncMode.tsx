"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadSeedanceMedia } from "../lib/upload";
import type { SeedanceV4WizardState } from "../types";
import { CapabilityCard } from "../CapabilityCard";

interface LipsyncModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

export function LipsyncMode({ state, setState, onReady }: LipsyncModeProps) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  async function handleImg(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    setUploadingImg(true);
    try {
      const { url } = await uploadSeedanceMedia(f, "image");
      setState({ lipsyncImageUrl: url });
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadingImg(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  }

  async function handleAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("audio/")) {
      toast.error("Please pick an audio file");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast.error("Audio must be under 15 MB");
      return;
    }
    setUploadingAudio(true);
    try {
      const { url } = await uploadSeedanceMedia(f, "audio");
      setState({ lipsyncAudioUrl: url });
      toast.success("Audio uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audio upload failed");
    } finally {
      setUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  }

  const canContinue = !!state.lipsyncImageUrl && !!state.lipsyncAudioUrl;

  return (
    <div className="space-y-6">
      <CapabilityCard mode="lipsyncing" />

      <UploadCard
        title="Speaker image (required)"
        description="A photo of the person who will speak. Mouth should be visible."
        url={state.lipsyncImageUrl}
        uploading={uploadingImg}
        accept="image/*"
        inputRef={imgInputRef}
        onUpload={handleImg}
        onClear={() => setState({ lipsyncImageUrl: undefined })}
      />
      <UploadCard
        title="Audio (required)"
        description="The voice the speaker should lip-sync to. MP3 / WAV up to 15 MB."
        url={state.lipsyncAudioUrl}
        uploading={uploadingAudio}
        accept="audio/*"
        inputRef={audioInputRef}
        onUpload={handleAudio}
        onClear={() => setState({ lipsyncAudioUrl: undefined })}
        isAudio
      />

      <Button
        onClick={onReady}
        disabled={!canContinue}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}

function UploadCard({
  title,
  description,
  url,
  uploading,
  accept,
  inputRef,
  onUpload,
  onClear,
  isAudio,
}: {
  title: string;
  description: string;
  url?: string;
  uploading: boolean;
  accept: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  isAudio?: boolean;
}) {
  return (
    <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-coco-brown">{title}</h3>
        <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">{description}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onUpload}
        className="hidden"
      />
      {url ? (
        <div className="flex items-center gap-3 rounded-xl border-2 border-coco-golden/30 bg-white p-3">
          {isAudio ? (
            <audio src={url} controls className="flex-1" />
          ) : (
            <img src={url} alt="Uploaded" className="h-16 w-16 rounded object-cover" />
          )}
          <button
            type="button"
            onClick={onClear}
            className="text-coco-brown-medium/40 hover:text-red-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-coco-beige-dark bg-white p-6 transition-colors hover:border-coco-golden/40"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
          ) : (
            <>
              <Upload className="h-5 w-5 text-coco-brown-medium/30" />
              <span className="text-xs font-medium text-coco-brown-medium">
                Click to upload
              </span>
            </>
          )}
        </button>
      )}
    </section>
  );
}
