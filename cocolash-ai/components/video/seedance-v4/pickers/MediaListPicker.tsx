"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Film, Link2, Loader2, Music, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isPublicHttpsUrl } from "@/lib/seedance/v25/schema";
import { uploadVideoInput, validateVideoInputFile } from "../lib/upload";
import { FromYourVideosGrid } from "./FromYourVideosGrid";

type MediaKind = "video" | "audio";
type Tab = "upload" | "gallery" | "url";

interface MediaListPickerProps {
  kind: MediaKind;
  urls: string[];
  onChange: (urls: string[]) => void;
  /** Hard cap (videos ≤ 10, audios ≤ 10, lipsync audio = 1). */
  max: number;
  title: string;
  help?: string;
  /** Show the red "required" asterisk + empty-state warning. */
  required?: boolean;
}

/**
 * Video / audio input picker (D6, D8).
 *
 * Three sources: upload to the `video-inputs` bucket (via `uploadVideoInput`),
 * "From your videos" (finished clips, video only) and pasting a public https
 * URL. Every entry is previewable and removable, with a live N / max counter.
 */
export function MediaListPicker({
  kind,
  urls,
  onChange,
  max,
  title,
  help,
  required,
}: MediaListPickerProps) {
  const [tab, setTab] = useState<Tab>("upload");
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, max - urls.length);
  const atLimit = remaining === 0;
  const Icon = kind === "video" ? Film : Music;

  function add(next: string[]) {
    const merged = [...urls];
    for (const url of next) {
      if (merged.length >= max) break;
      if (!merged.includes(url)) merged.push(url);
    }
    onChange(merged);
  }

  function remove(url: string) {
    onChange(urls.filter((u) => u !== url));
  }

  function toggle(url: string) {
    if (urls.includes(url)) {
      remove(url);
      return;
    }
    if (atLimit) {
      toast.error(`Maximum ${max} ${kind}${max === 1 ? "" : "s"}.`);
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
      toast.error(`Maximum ${max} ${kind}${max === 1 ? "" : "s"} already added.`);
      reset();
      return;
    }

    const valid: File[] = [];
    for (const file of picked) {
      const problem = validateVideoInputFile(file, kind);
      if (problem) {
        toast.error(problem);
        continue;
      }
      valid.push(file);
    }
    const toUpload = valid.slice(0, remaining);
    if (valid.length > toUpload.length) {
      toast.warning(`Only ${remaining} more can be added (max ${max}).`);
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
          const { url } = await uploadVideoInput(file, kind);
          uploaded.push(url);
        } catch (err) {
          toast.error(
            `${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`
          );
        }
      }
      if (uploaded.length > 0) {
        add(uploaded);
        toast.success(
          `${uploaded.length} ${kind}${uploaded.length === 1 ? "" : "s"} added.`
        );
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
      toast.error("Paste a public https:// URL — Seedance has to be able to fetch it.");
      return;
    }
    if (urls.includes(value)) {
      toast.info("That URL is already in the list.");
      return;
    }
    if (atLimit) {
      toast.error(`Maximum ${max} ${kind}${max === 1 ? "" : "s"}.`);
      return;
    }
    add([value]);
    setUrlDraft("");
    toast.success(`${kind === "video" ? "Video" : "Audio"} URL added.`);
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

      {/* Source tabs */}
      <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
        <TabBtn active={tab === "upload"} onClick={() => setTab("upload")} icon={Upload} label="Upload" />
        {kind === "video" && (
          <TabBtn
            active={tab === "gallery"}
            onClick={() => setTab("gallery")}
            icon={Film}
            label="From your videos"
          />
        )}
        <TabBtn active={tab === "url"} onClick={() => setTab("url")} icon={Link2} label="Paste URL" />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={kind === "video" ? "video/*" : "audio/*"}
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
                {atLimit
                  ? `Maximum ${max} reached`
                  : `Click to upload ${kind === "video" ? "video" : "audio"} (up to 50 MB)`}
              </span>
            </>
          )}
        </button>
      )}

      {tab === "gallery" && kind === "video" && (
        <FromYourVideosGrid selectedUrls={urls} onToggle={toggle} atLimit={atLimit} />
      )}

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
            placeholder={`https://…/clip.${kind === "video" ? "mp4" : "mp3"}`}
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

      {/* Chosen media */}
      {urls.length > 0 ? (
        <ul className="space-y-2">
          {urls.map((url) => (
            <li
              key={url}
              className="flex items-center gap-3 rounded-xl border-2 border-coco-golden/30 bg-white p-2"
            >
              {kind === "video" ? (
                <video
                  src={url}
                  controls
                  preload="metadata"
                  className="h-20 w-32 shrink-0 rounded bg-black object-cover"
                />
              ) : (
                <audio src={url} controls preload="metadata" className="min-w-0 flex-1" />
              )}
              <p className="min-w-0 flex-1 truncate text-[10px] text-coco-brown-medium/60">
                {url}
              </p>
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label="Remove"
                className="shrink-0 text-coco-brown-medium/40 transition-colors hover:text-red-500"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-coco-beige-dark bg-coco-beige-light/40 px-3 py-2 text-[11px] text-coco-brown-medium/60">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {required
            ? `At least one ${kind} is required for this mode.`
            : `No ${kind}s added — this input is optional.`}
        </div>
      )}
    </section>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-medium transition-all",
        active
          ? "bg-white text-coco-brown shadow-sm"
          : "text-coco-brown-medium/50 hover:text-coco-brown-medium"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
