"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Clock, Library } from "lucide-react";
import type { VideoScript, CampaignType, VideoPipeline } from "@/lib/types";

interface ScriptLibraryPickerProps {
  campaignType?: CampaignType;
  pipeline: VideoPipeline;
  onSelect: (script: VideoScript) => void;
}

export function ScriptLibraryPicker({
  campaignType,
  pipeline,
  onSelect,
}: ScriptLibraryPickerProps) {
  const [scripts, setScripts] = useState<VideoScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchScripts = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "20", pipeline });
        if (campaignType) params.set("campaignType", campaignType);
        const res = await fetch(`/api/scripts?${params}`);
        const data = await res.json();
        if (res.ok) {
          setScripts(data.scripts ?? []);
        }
      } catch {
        // Network error — leave empty
      } finally {
        setLoading(false);
      }
    };
    fetchScripts();
  }, [campaignType, pipeline]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
      </div>
    );
  }

  if (scripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Library className="h-8 w-8 text-coco-brown-medium/30" />
        <p className="mt-3 text-sm font-medium text-coco-brown-medium">
          No saved scripts yet
        </p>
        <p className="mt-1 text-xs text-coco-brown-medium/60">
          Generate scripts with AI first — they&apos;ll automatically appear
          here for reuse.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-coco-brown">
        Saved Scripts
      </label>
      <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
        {scripts.map((s) => {
          const isSelected = selectedId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelectedId(s.id);
                onSelect(s);
              }}
              className={cn(
                "w-full rounded-xl border-2 p-3 text-left transition-all duration-200",
                isSelected
                  ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                  : "border-coco-beige-dark bg-white hover:border-coco-golden/40 hover:bg-coco-golden/5"
              )}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="line-clamp-1 text-xs font-medium text-coco-brown">
                  {s.title || `${s.campaign_type} — ${s.tone}`}
                </span>
                <div className="ml-2 flex shrink-0 items-center gap-2 text-[10px] text-coco-brown-medium/50">
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {s.duration_seconds}s
                  </span>
                  <span>
                    {new Date(s.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
              {s.hook_text && (
                <p className="line-clamp-1 text-xs font-semibold text-coco-golden">
                  {s.hook_text}
                </p>
              )}
              <p className="mt-0.5 line-clamp-2 text-xs text-coco-brown-medium/70">
                {s.script_text}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
