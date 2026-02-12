"use client";

import { Input } from "@/components/ui/input";

interface ContextNoteInputProps {
  value: string;
  onChange: (value: string) => void;
}

const MAX_CHARS = 100;

export function ContextNoteInput({ value, onChange }: ContextNoteInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-coco-brown">
          Context Note{" "}
          <span className="font-normal text-coco-brown-medium/60">
            (optional)
          </span>
        </label>
        <span className="text-[11px] text-coco-brown-medium/60">
          {value.length}/{MAX_CHARS}
        </span>
      </div>
      <Input
        type="text"
        value={value}
        onChange={(e) => {
          const text = e.target.value.slice(0, MAX_CHARS);
          onChange(text);
        }}
        placeholder="E.g., 'Valentine's Day promo' or 'summer collection'"
        className="border-coco-beige-dark bg-white text-sm placeholder:text-coco-brown-medium/40"
        maxLength={MAX_CHARS}
      />
      <p className="text-[11px] text-coco-brown-medium/50">
        Short note to guide the AI — appears in the prompt for extra context.
      </p>
    </div>
  );
}
