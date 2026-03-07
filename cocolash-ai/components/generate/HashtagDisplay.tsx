"use client";

import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface HashtagDisplayProps {
  hashtags: string[];
  limit: number;
  onRemove?: (tag: string) => void;
  readonly?: boolean;
}

export function HashtagDisplay({
  hashtags,
  limit,
  onRemove,
  readonly = false,
}: HashtagDisplayProps) {
  const isOverLimit = hashtags.length > limit;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-coco-brown-medium/60">
          Hashtags
        </span>
        <span
          className={`text-[10px] font-medium ${
            isOverLimit ? "text-red-500" : "text-coco-brown-medium/40"
          }`}
        >
          {hashtags.length}/{limit}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {hashtags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="gap-0.5 bg-coco-beige/80 px-1.5 py-0 text-[10px] text-coco-brown-medium"
          >
            #{tag}
            {!readonly && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-red-100 hover:text-red-600"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </Badge>
        ))}
        {hashtags.length === 0 && (
          <span className="text-[10px] italic text-coco-brown-medium/30">
            No hashtags
          </span>
        )}
      </div>
    </div>
  );
}
