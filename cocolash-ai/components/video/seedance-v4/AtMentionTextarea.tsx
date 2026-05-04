"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea with `@`-handle autocomplete for Seedance reference tokens.
 *
 * When the user types `@` the popover opens with a list of available handles
 * (e.g. `@image1 — Appearance`, `@image2 — Product`). Selecting one inserts
 * the literal `@imageN` token at the cursor position. Continuing to type
 * after the `@` filters the list by handle and role.
 *
 * Mirrors the Enhancor convention used in the SeeDance 2 best-practices
 * guide and the Director's mode-specific system prompts:
 *   "@image1 = appearance only", "@video1 = camera only", etc.
 */

export interface AtMention {
  /** The literal token inserted into the textarea, including the @. */
  token: string;
  /** Role / job description shown in the dropdown. */
  role: string;
  /** Optional thumbnail URL — rendered in the dropdown when present. */
  thumbUrl?: string;
}

interface AtMentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  mentions: AtMention[];
  placeholder?: string;
  rows?: number;
  className?: string;
  id?: string;
  /** Pixels above the textarea where the popover anchors (default: cursor-relative). */
  popoverPlacement?: "below" | "above";
}

export function AtMentionTextarea({
  value,
  onChange,
  mentions,
  placeholder,
  rows = 4,
  className,
  id,
  popoverPlacement = "below",
}: AtMentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  /** The text after the most recent unfinished `@`, e.g. "im" — used to filter. */
  const [query, setQuery] = useState("");
  /** The position in the string where the @ sits — used to replace on insert. */
  const [atIndex, setAtIndex] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = mentions.filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      m.token.slice(1).toLowerCase().startsWith(q) ||
      m.role.toLowerCase().includes(q)
    );
  });

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    detectMention(e.target);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) {
      if (e.key === "Escape") {
        // no-op when closed
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (filtered[activeIdx]) {
        e.preventDefault();
        insertMention(filtered[activeIdx]);
        return;
      }
    }
  }

  function handleClick() {
    if (textareaRef.current) detectMention(textareaRef.current);
  }

  function handleKeyUp() {
    if (textareaRef.current) detectMention(textareaRef.current);
  }

  function detectMention(el: HTMLTextAreaElement) {
    const cursor = el.selectionStart;
    const left = el.value.slice(0, cursor);
    // Find the most recent @ that is preceded by whitespace, line-start, or
    // start-of-string and not followed by whitespace before the cursor.
    const match = /(^|\s)@([\w-]*)$/.exec(left);
    if (match) {
      const matchIdx = left.length - match[0].length + match[1].length; // index of the @
      setAtIndex(matchIdx);
      setQuery(match[2] ?? "");
      setActiveIdx(0);
      setOpen(true);
    } else {
      setOpen(false);
      setAtIndex(null);
    }
  }

  function insertMention(m: AtMention) {
    if (atIndex === null || !textareaRef.current) return;
    const el = textareaRef.current;
    const cursor = el.selectionStart;
    const before = value.slice(0, atIndex);
    const after = value.slice(cursor);
    const inserted = m.token + " ";
    const next = before + inserted + after;
    onChange(next);
    setOpen(false);
    setAtIndex(null);
    setQuery("");
    // Restore caret after the inserted token
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = (before + inserted).length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  }

  // Close on click-away
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onKeyUp={handleKeyUp}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "w-full rounded-xl border-2 border-coco-beige-dark bg-white p-3 text-xs text-coco-brown outline-none focus:border-coco-golden",
          className
        )}
      />
      {open && filtered.length > 0 && (
        <div
          className={cn(
            "absolute z-20 max-h-72 w-full max-w-md overflow-y-auto rounded-xl border-2 border-coco-beige-dark bg-white p-1.5 shadow-xl",
            popoverPlacement === "below" ? "top-full mt-1" : "bottom-full mb-1"
          )}
        >
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-coco-brown-medium/50">
            Reference {filtered.length === 1 ? "asset" : "assets"}
          </p>
          {filtered.map((m, i) => (
            <button
              key={m.token}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(m);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                i === activeIdx
                  ? "bg-coco-golden/15 text-coco-brown"
                  : "text-coco-brown-medium hover:bg-coco-beige-light"
              )}
            >
              {m.thumbUrl && (
                <img
                  src={m.thumbUrl}
                  alt={m.token}
                  className="h-8 w-8 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">
                  <code className="rounded bg-coco-beige px-1 py-0.5 text-[11px]">
                    {m.token}
                  </code>{" "}
                  <span className="ml-1 text-coco-brown-medium/70">{m.role}</span>
                </p>
              </div>
            </button>
          ))}
          <p className="px-2 py-1 text-[9px] text-coco-brown-medium/40">
            ↑↓ to navigate · Enter to insert · Esc to close
          </p>
        </div>
      )}
    </div>
  );
}
