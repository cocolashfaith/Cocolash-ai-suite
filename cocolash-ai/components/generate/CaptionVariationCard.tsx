"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HashtagDisplay } from "./HashtagDisplay";
import {
  Check,
  Copy,
  Pencil,
  X,
  CheckCircle,
} from "lucide-react";
import type { CaptionVariation } from "@/lib/types";

interface CaptionVariationCardProps {
  variation: CaptionVariation;
  index: number;
  isSelected: boolean;
  platformLimit: number;
  hashtagLimit: number;
  onSelect: () => void;
  onUpdate: (text: string, hashtags: string[]) => void;
}

export function CaptionVariationCard({
  variation,
  index,
  isSelected,
  platformLimit,
  hashtagLimit,
  onSelect,
  onUpdate,
}: CaptionVariationCardProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(variation.text);
  const [editHashtags, setEditHashtags] = useState(variation.hashtags);
  const [copied, setCopied] = useState(false);

  const charColor =
    variation.character_count <= platformLimit * 0.8
      ? "text-emerald-600 bg-emerald-50"
      : variation.character_count <= platformLimit
        ? "text-amber-600 bg-amber-50"
        : "text-red-600 bg-red-50";

  const handleCopy = async () => {
    const hashtags = variation.hashtags.map((h) => `#${h}`).join(" ");
    const fullText = hashtags
      ? `${variation.text}\n\n${hashtags}`
      : variation.text;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    onUpdate(editText, editHashtags);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(variation.text);
    setEditHashtags(variation.hashtags);
    setEditing(false);
  };

  const handleRemoveHashtag = (tag: string) => {
    const updated = editHashtags.filter((h) => h !== tag);
    setEditHashtags(updated);
    if (!editing) {
      onUpdate(variation.text, updated);
    }
  };

  return (
    <div
      className={`rounded-xl border p-3 transition-all ${
        isSelected
          ? "border-coco-golden bg-coco-golden/5 ring-1 ring-coco-golden/30"
          : "border-coco-beige-dark bg-white hover:border-coco-golden/30"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase text-coco-brown-medium/40">
            Option {index + 1}
          </span>
          {isSelected && (
            <Badge className="gap-0.5 bg-coco-golden text-[9px] text-white">
              <CheckCircle className="h-2.5 w-2.5" />
              Selected
            </Badge>
          )}
        </div>
        <Badge variant="outline" className={`text-[10px] ${charColor}`}>
          {variation.character_count}/{platformLimit}
        </Badge>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-sm text-coco-brown focus:border-coco-golden focus:outline-none focus:ring-1 focus:ring-coco-golden/30"
          />
          <p className="text-right text-[10px] text-coco-brown-medium/40">
            {editText.length}/{platformLimit}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSaveEdit}
              className="h-7 bg-coco-golden text-xs text-white hover:bg-coco-golden-dark"
            >
              <Check className="mr-1 h-3 w-3" />
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancelEdit}
              className="h-7 text-xs"
            >
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mb-2 whitespace-pre-wrap text-sm leading-relaxed text-coco-brown">
          {variation.text}
        </p>
      )}

      <HashtagDisplay
        hashtags={editing ? editHashtags : variation.hashtags}
        limit={hashtagLimit}
        onRemove={handleRemoveHashtag}
      />

      {!editing && (
        <div className="mt-2 flex gap-1.5">
          <Button
            size="sm"
            variant={isSelected ? "default" : "outline"}
            onClick={onSelect}
            className={`h-7 flex-1 text-[10px] ${
              isSelected
                ? "bg-coco-golden text-white hover:bg-coco-golden-dark"
                : "border-coco-golden/30 text-coco-golden-dark hover:bg-coco-golden/5"
            }`}
          >
            {isSelected ? (
              <>
                <CheckCircle className="mr-1 h-3 w-3" />
                Selected
              </>
            ) : (
              "Select"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            className="h-7 text-[10px]"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="h-7 text-[10px]"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
