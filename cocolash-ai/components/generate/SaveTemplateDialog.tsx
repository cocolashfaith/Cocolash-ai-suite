"use client";

import { useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { GenerationSelections } from "@/lib/types";

interface SaveTemplateDialogProps {
  selections: GenerationSelections;
  thumbnailUrl?: string;
  onSaved?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  "lash-closeup": "Close-Up",
  lifestyle: "Lifestyle",
  product: "Product",
  "before-after": "Before/After",
  "application-process": "Application",
};

export function SaveTemplateDialog({
  selections,
  thumbnailUrl,
  onSaved,
}: SaveTemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name for this template");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          selections,
          category: selections.category,
          thumbnailUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save");
      }

      toast.success(`Template "${name.trim()}" saved!`);
      setName("");
      setOpen(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const categoryLabel = CATEGORY_LABELS[selections.category] || selections.category;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-coco-golden/30 text-coco-golden-dark hover:bg-coco-golden/5"
        >
          <Bookmark className="h-3.5 w-3.5" />
          Save Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="border-coco-beige-dark bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-coco-brown">
            Save Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-xs text-coco-brown-medium/70">
            Save these generation settings as a reusable template. You can
            quickly load them from the generate page next time.
          </p>

          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md bg-coco-beige px-2 py-0.5 text-[10px] font-medium text-coco-brown-medium">
              {categoryLabel}
            </span>
            <span className="rounded-md bg-coco-beige px-2 py-0.5 text-[10px] font-medium text-coco-brown-medium">
              {selections.aspectRatio}
            </span>
            <span className="rounded-md bg-coco-beige px-2 py-0.5 text-[10px] font-medium text-coco-brown-medium">
              {selections.resolution}
            </span>
            {selections.logoOverlay.enabled && (
              <span className="rounded-md bg-coco-golden/10 px-2 py-0.5 text-[10px] font-medium text-coco-golden-dark">
                Logo
              </span>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="template-name"
              className="text-sm font-medium text-coco-brown"
            >
              Template Name
            </Label>
            <Input
              id="template-name"
              placeholder='e.g. "Valentine Close-Up 4:5"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="border-coco-pink-dark/40 bg-white text-coco-brown placeholder:text-coco-brown-medium/40 focus-visible:ring-coco-golden"
              disabled={saving}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleSave();
              }}
            />
            <p className="text-right text-[10px] text-coco-brown-medium/40">
              {name.length}/60
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="flex-1 border-coco-brown-medium/20"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex-1 gap-2 bg-coco-golden text-white hover:bg-coco-golden-dark disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4" />
                  Save Template
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
