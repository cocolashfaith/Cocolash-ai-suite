"use client";

import { useState } from "react";
import { ChevronDown, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptEntry {
  id: string;
  name: string;
  surface: string;
  model: string;
  filePath: string;
  text: string;
  lastModified: string | null;
  charCount: number;
}

interface PromptsListProps {
  prompts: PromptEntry[];
}

export function PromptsList({ prompts }: PromptsListProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <ul className="space-y-3">
      {prompts.map((p) => {
        const isOpen = openIds.has(p.id);
        return (
          <li
            key={p.id}
            className="overflow-hidden rounded-xl border border-coco-beige-dark bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => toggle(p.id)}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-coco-beige/30"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-coco-brown">
                    {p.name}
                  </h3>
                  <code className="rounded bg-coco-beige px-1.5 py-0.5 text-[10px] text-coco-brown-medium">
                    {p.id}
                  </code>
                </div>
                <p className="truncate text-xs text-coco-brown-medium">
                  {p.surface}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-coco-brown-medium/70">
                  <span>
                    Model: <code className="text-coco-brown">{p.model}</code>
                  </span>
                  <span>
                    File: <code className="text-coco-brown">{p.filePath}</code>
                  </span>
                  {p.lastModified && (
                    <span>
                      Last edited: <code>{p.lastModified}</code>
                    </span>
                  )}
                  <span>{p.charCount.toLocaleString()} chars</span>
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-coco-brown-medium transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </button>
            {isOpen && (
              <div className="border-t border-coco-beige bg-coco-beige-light/40">
                <div className="flex items-center justify-end px-4 pt-3">
                  <button
                    type="button"
                    onClick={() => copy(p.id, p.text)}
                    className="flex items-center gap-1.5 rounded-md border border-coco-beige-dark bg-white px-2.5 py-1 text-[11px] font-medium text-coco-brown hover:bg-coco-beige"
                  >
                    {copied === p.id ? (
                      <>
                        <Check className="h-3 w-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy prompt
                      </>
                    )}
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-coco-brown">
                  {p.text}
                </pre>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
