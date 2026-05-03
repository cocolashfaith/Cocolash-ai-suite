"use client";

import { useRef, useState } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { SeedanceV4WizardState } from "../types";

interface MultiFrameModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

export function MultiFrameMode({ state, setState, onReady }: MultiFrameModeProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const refs = state.multiFrameReferenceImages ?? [];

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
      const filename = `seedance-multiframe/${Date.now()}-${Math.random()
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
      setState((prev) => ({
        multiFrameReferenceImages: [
          ...(prev.multiFrameReferenceImages ?? []),
          { url: publicUrl, role: "appearance" },
        ],
      }));
      toast.success("Reference image uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeRef(idx: number) {
    setState((prev) => {
      const next = [...(prev.multiFrameReferenceImages ?? [])];
      next.splice(idx, 1);
      return { multiFrameReferenceImages: next };
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-coco-brown">
            Reference image(s)
          </h3>
          <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
            Upload up to 3 references — they anchor identity, product, or environment across all segments. The Seedance Director will then propose a SEGMENT LIST (each with its own prompt + duration) that you can review and edit before generation. Total duration is your clip duration ({state.duration}s).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {refs.map((r, i) => (
            <div
              key={`${r.url}-${i}`}
              className="relative aspect-square overflow-hidden rounded-lg border-2 border-coco-beige-dark bg-white"
            >
              <img src={r.url} alt={`@image${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeRef(i)}
                className="absolute right-1 top-1 rounded-full bg-white/80 p-1 hover:bg-white"
              >
                <X className="h-3 w-3 text-coco-brown-medium" />
              </button>
              <span className="absolute left-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white">
                @image{i + 1}
              </span>
            </div>
          ))}
          {refs.length < 3 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-coco-beige-dark bg-white text-coco-brown-medium/60 hover:border-coco-golden/40",
                uploading && "opacity-50"
              )}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px]">Add image</span>
                </>
              )}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
        />
      </section>

      <Button
        onClick={onReady}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Segment Plan →
      </Button>
    </div>
  );
}
