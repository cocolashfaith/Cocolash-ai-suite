"use client";

import { useRef } from "react";
import { Plus, Upload, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AtMentionTextarea, type AtMention } from "../AtMentionTextarea";
import { uploadSeedanceMedia } from "../lib/upload";
import type { SeedanceV4WizardState } from "../types";

const ROLES = [
  { value: "appearance", label: "Appearance", desc: "Identity / face" },
  { value: "product", label: "Product", desc: "Product design" },
  { value: "background", label: "Background", desc: "Scene look" },
  { value: "style", label: "Style", desc: "Color / lighting ref" },
] as const;

type RefRole = (typeof ROLES)[number]["value"];

interface MultiReferenceModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

export function MultiReferenceMode({
  state,
  setState,
  onReady,
}: MultiReferenceModeProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refs = state.multiReferenceImages ?? [];

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadSeedanceMedia(file, "image");
      setState((prev) => ({
        multiReferenceImages: [
          ...(prev.multiReferenceImages ?? []),
          { url, role: "appearance" },
        ],
      }));
      toast.success("Reference uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setRole(idx: number, role: RefRole) {
    setState((prev) => {
      const next = [...(prev.multiReferenceImages ?? [])];
      next[idx] = { ...next[idx], role };
      return { multiReferenceImages: next };
    });
  }

  function removeRef(idx: number) {
    setState((prev) => {
      const next = [...(prev.multiReferenceImages ?? [])];
      next.splice(idx, 1);
      return { multiReferenceImages: next };
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-coco-brown">
            Reference images
          </h3>
          <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
            Upload up to 6 images. For each one, pick the job it does — appearance, product, background, or style. The Director will reference each one explicitly.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {refs.map((r, i) => (
            <div
              key={`${r.url}-${i}`}
              className="overflow-hidden rounded-lg border-2 border-coco-beige-dark bg-white"
            >
              <div className="relative aspect-square">
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
              <select
                value={r.role}
                onChange={(e) => setRole(i, e.target.value as RefRole)}
                className="w-full border-t border-coco-beige px-2 py-1 text-[11px] text-coco-brown outline-none"
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {refs.length < 6 && (
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

      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-coco-brown">
            Specific instructions for the Director (optional)
          </h3>
          <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
            Type <code className="rounded bg-coco-beige px-1">@</code> to
            reference an uploaded image — e.g.{" "}
            <code className="rounded bg-coco-beige px-1">@image1</code> for
            appearance,{" "}
            <code className="rounded bg-coco-beige px-1">@image2</code> for
            product. The Director will pass these through to Seedance as
            asset roles.
          </p>
        </div>
        <AtMentionTextarea
          value={state.multiReferenceUserInstructions ?? ""}
          onChange={(v) => setState({ multiReferenceUserInstructions: v })}
          mentions={refs.map((r, i): AtMention => ({
            token: `@image${i + 1}`,
            role: capitalize(r.role),
            thumbUrl: r.url,
          }))}
          rows={4}
          placeholder='Tip: type "@" to insert a reference. Example: "@image1 is the creator. @image2 — @image5 are the product. Keep the face from @image1 unchanged."'
        />
      </section>

      <Button
        onClick={onReady}
        disabled={refs.length === 0}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
