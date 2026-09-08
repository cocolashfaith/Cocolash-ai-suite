"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImageIcon, Link2, Loader2, Package, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isPublicHttpsUrl } from "@/lib/seedance/v25/schema";
import { uploadVideoInput, validateVideoInputFile } from "../lib/upload";

export type ImageSource = "upload" | "gallery" | "library" | "url";

interface ImageMultiPickerProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  /** Hard cap (images ≤ 30 on 2.5, ≤ 9 on 2.0). */
  max: number;
  title: string;
  help?: string;
  /** Which tabs to offer, in order. Defaults to upload + gallery + url. */
  sources?: ImageSource[];
  required?: boolean;
}

interface RemoteImage {
  id: string;
  url: string;
  label: string;
}

const SOURCE_META: Record<ImageSource, { label: string; icon: React.ElementType }> = {
  upload: { label: "Upload", icon: Upload },
  gallery: { label: "UGC avatars", icon: ImageIcon },
  library: { label: "Product library", icon: Package },
  url: { label: "Paste URL", icon: Link2 },
};

const DEFAULT_SOURCES: ImageSource[] = ["upload", "gallery", "url"];

/**
 * Multi-select image picker (D8) used by every 2.5 mode that takes `images[]`.
 *
 * Sources: upload (→ `video-inputs` bucket via `uploadVideoInput`), the UGC
 * avatar gallery, the product reference library and a pasted public https URL.
 * Live N / max counter; each chosen image is removable.
 */
export function ImageMultiPicker({
  urls,
  onChange,
  max,
  title,
  help,
  sources = DEFAULT_SOURCES,
  required,
}: ImageMultiPickerProps) {
  const tabs = sources.length > 0 ? sources : DEFAULT_SOURCES;
  const [tab, setTab] = useState<ImageSource>(tabs[0]);
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [remote, setRemote] = useState<RemoteImage[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, max - urls.length);
  const atLimit = remaining === 0;

  const loadRemote = useCallback(async (source: "gallery" | "library") => {
    setLoadingRemote(true);
    setRemote([]);
    try {
      if (source === "gallery") {
        const res = await fetch(
          "/api/images?limit=48&assetTag=ugc-avatar&sortBy=created_at&sortOrder=desc"
        );
        const data = (await res.json().catch(() => ({}))) as {
          images?: Array<{ id: string; image_url: string }>;
        };
        setRemote(
          (data.images ?? []).map((i) => ({ id: i.id, url: i.image_url, label: "UGC avatar" }))
        );
      } else {
        const res = await fetch("/api/product-categories");
        const data = (await res.json().catch(() => ({}))) as {
          categories?: Array<{ name?: string; images?: Array<{ id: string; image_url: string }> }>;
        };
        const flat: RemoteImage[] = [];
        for (const cat of data.categories ?? []) {
          for (const img of cat.images ?? []) {
            flat.push({ id: img.id, url: img.image_url, label: cat.name ?? "Product" });
          }
        }
        setRemote(flat);
      }
    } catch {
      // Non-fatal — the tab simply shows its empty state.
    } finally {
      setLoadingRemote(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "gallery" || tab === "library") void loadRemote(tab);
  }, [tab, loadRemote]);

  function add(next: string[]) {
    const merged = [...urls];
    for (const url of next) {
      if (merged.length >= max) break;
      if (!merged.includes(url)) merged.push(url);
    }
    onChange(merged);
  }

  function toggle(url: string) {
    if (urls.includes(url)) {
      onChange(urls.filter((u) => u !== url));
      return;
    }
    if (atLimit) {
      toast.error(`Maximum ${max} image${max === 1 ? "" : "s"}.`);
      return;
    }
    add([url]);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const reset = () => {
      if (fileRef.current) fileRef.current.value = "";
    };
    if (picked.length === 0) return;
    if (atLimit) {
      toast.error(`Maximum ${max} image${max === 1 ? "" : "s"} already added.`);
      reset();
      return;
    }

    const valid: File[] = [];
    for (const file of picked) {
      const problem = validateVideoInputFile(file, "image");
      if (problem) {
        toast.error(problem);
        continue;
      }
      valid.push(file);
    }
    const toUpload = valid.slice(0, remaining);
    if (valid.length > toUpload.length) {
      toast.warning(`Only ${remaining} more image${remaining === 1 ? "" : "s"} can be added.`);
    }
    if (toUpload.length === 0) {
      reset();
      return;
    }

    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of toUpload) {
        try {
          const { url } = await uploadVideoInput(file, "image");
          uploaded.push(url);
        } catch (err) {
          toast.error(`${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`);
        }
      }
      if (uploaded.length > 0) {
        add(uploaded);
        toast.success(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} added.`);
      }
    } finally {
      setUploading(false);
      reset();
    }
  }

  function handleAddUrl() {
    const value = urlDraft.trim();
    if (!value) return;
    if (!isPublicHttpsUrl(value)) {
      toast.error("Paste a public https:// image URL — Seedance has to be able to fetch it.");
      return;
    }
    if (urls.includes(value)) {
      toast.info("That image is already selected.");
      return;
    }
    if (atLimit) {
      toast.error(`Maximum ${max} image${max === 1 ? "" : "s"}.`);
      return;
    }
    add([value]);
    setUrlDraft("");
    toast.success("Image URL added.");
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-coco-brown">
          {title} {required && <span className="text-coco-golden">*</span>}
        </h3>
        <p
          className={cn(
            "shrink-0 text-[11px] font-medium",
            urls.length > 0 ? "text-coco-golden" : "text-coco-brown-medium/50"
          )}
        >
          {urls.length} / {max}
        </p>
      </div>
      {help && <p className="text-[11px] text-coco-brown-medium/60">{help}</p>}

      {tabs.length > 1 && (
        <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
          {tabs.map((source) => {
            const meta = SOURCE_META[source];
            const Icon = meta.icon;
            const active = tab === source;
            return (
              <button
                key={source}
                type="button"
                onClick={() => setTab(source)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-medium transition-all",
                  active
                    ? "bg-white text-coco-brown shadow-sm"
                    : "text-coco-brown-medium/50 hover:text-coco-brown-medium"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        onChange={handleUpload}
        className="hidden"
      />

      {tab === "upload" && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || atLimit}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-coco-beige-dark bg-white p-6 transition-colors hover:border-coco-golden/40",
            (uploading || atLimit) && "opacity-50"
          )}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
          ) : (
            <>
              <Upload className="h-5 w-5 text-coco-brown-medium/30" />
              <span className="text-xs font-medium text-coco-brown-medium">
                {atLimit ? `Maximum ${max} reached` : "Click to upload images (PNG / JPEG, ≤ 10 MB)"}
              </span>
            </>
          )}
        </button>
      )}

      {(tab === "gallery" || tab === "library") &&
        (loadingRemote ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
            <Loader2 className="h-4 w-4 animate-spin text-coco-brown-medium/40" />
            <span className="ml-2 text-xs text-coco-brown-medium/50">Loading…</span>
          </div>
        ) : remote.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
            <ImageIcon className="h-6 w-6 text-coco-brown-medium/30" />
            <p className="mt-2 text-xs text-coco-brown-medium/50">
              Nothing here yet — upload an image or paste a URL instead.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {remote.map((img) => {
              const selected = urls.includes(img.url);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => toggle(img.url)}
                  title={img.label}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                    selected
                      ? "border-coco-golden ring-2 ring-coco-golden/30"
                      : "border-transparent hover:border-coco-golden/40"
                  )}
                >
                  {/* Supabase / CDN hosts are not in next.config remotePatterns. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.label} className="h-full w-full object-cover" />
                  {selected && (
                    <span className="absolute inset-0 flex items-center justify-center bg-coco-golden/20">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

      {tab === "url" && (
        <div className="flex gap-2">
          <input
            type="url"
            inputMode="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddUrl();
              }
            }}
            placeholder="https://…/image.jpg"
            className="flex-1 rounded-lg border-2 border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none focus:border-coco-golden"
          />
          <Button
            type="button"
            onClick={handleAddUrl}
            disabled={atLimit || urlDraft.trim().length === 0}
            variant="outline"
            className="shrink-0 text-xs"
          >
            Add
          </Button>
        </div>
      )}

      {/* Chosen images */}
      {urls.length > 0 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {urls.map((url, i) => (
            <div key={url} className="group relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Selected image ${i + 1}`}
                className="h-full w-full rounded-lg border-2 border-coco-golden/30 object-cover"
              />
              <span className="absolute left-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[9px] font-bold text-white">
                @image{i + 1}
              </span>
              <button
                type="button"
                onClick={() => onChange(urls.filter((u) => u !== url))}
                aria-label={`Remove image ${i + 1}`}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-coco-brown/70 text-white transition-colors hover:bg-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-coco-beige-dark bg-coco-beige-light/40 px-3 py-2 text-[11px] text-coco-brown-medium/60">
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          {required
            ? "At least one image is required for this mode."
            : "No images added — this input is optional."}
        </div>
      )}
    </section>
  );
}
