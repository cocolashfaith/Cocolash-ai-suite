"use client";

import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  Loader2,
  Save,
  RotateCcw,
  X,
  Plus,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_BRAND_VOICE } from "@/lib/prompts/captions/system";
import type { CaptionStyle, CaptionSettings } from "@/lib/types";

const STYLE_OPTIONS: { value: CaptionStyle; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "professional", label: "Professional" },
  { value: "promotional", label: "Promotional" },
  { value: "storytelling", label: "Storytelling" },
  { value: "question", label: "Question-based" },
];

const CTA_EXAMPLES = [
  "Shop now at cocolash.com",
  "Link in bio",
  "Tap to shop the look",
  "DM us for details",
];

export function CaptionSettingsForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [brandVoice, setBrandVoice] = useState("");
  const [defaultStyle, setDefaultStyle] = useState<CaptionStyle>("casual");
  const [alwaysInclude, setAlwaysInclude] = useState<string[]>([]);
  const [neverInclude, setNeverInclude] = useState<string[]>([]);
  const [defaultCta, setDefaultCta] = useState("");

  const [alwaysInput, setAlwaysInput] = useState("");
  const [neverInput, setNeverInput] = useState("");

  const alwaysRef = useRef<HTMLInputElement>(null);
  const neverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/settings/captions");
        const data: CaptionSettings = await res.json();

        setBrandVoice(data.brand_voice_prompt ?? "");
        setDefaultStyle(data.default_style);
        setAlwaysInclude(data.always_include_hashtags ?? []);
        setNeverInclude(data.never_include_hashtags ?? []);
        setDefaultCta(data.default_cta ?? "");
      } catch {
        toast.error("Failed to load caption settings");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/settings/captions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_voice_prompt: brandVoice,
          default_style: defaultStyle,
          always_include_hashtags: alwaysInclude,
          never_include_hashtags: neverInclude,
          default_cta: defaultCta,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaved(true);
      toast.success("Caption settings saved");
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save settings"
      );
    } finally {
      setSaving(false);
    }
  };

  const addTag = (
    list: string[],
    setList: (v: string[]) => void,
    input: string,
    setInput: (v: string) => void
  ) => {
    const tag = input.trim().replace(/^#/, "");
    if (!tag) return;
    if (list.includes(tag)) {
      toast.error(`"#${tag}" is already in the list`);
      return;
    }
    setList([...list, tag]);
    setInput("");
  };

  const removeTag = (
    list: string[],
    setList: (v: string[]) => void,
    tag: string
  ) => {
    setList(list.filter((t) => t !== tag));
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    list: string[],
    setList: (v: string[]) => void,
    input: string,
    setInput: (v: string) => void
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(list, setList, input, setInput);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-coco-beige-dark bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-coco-beige/30"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
          <MessageSquareText className="h-4 w-4 text-purple-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-coco-brown">
            Caption Settings
          </h3>
          <p className="text-xs text-coco-brown-medium">
            Brand voice, default style, hashtag rules, and call-to-action
          </p>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-coco-brown-medium/50" />
        ) : (
          <ChevronDown className="h-5 w-5 text-coco-brown-medium/50" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-coco-beige-dark px-5 pb-5 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
            </div>
          ) : (
            <>
              {/* Brand Voice Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-coco-brown">
                    Brand Voice Prompt
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBrandVoice(DEFAULT_BRAND_VOICE)}
                    className="h-6 gap-1 px-2 text-[10px] text-coco-brown-medium hover:text-coco-brown"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset to default
                  </Button>
                </div>
                <textarea
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  placeholder="Describe your brand's social media voice and tone…"
                  rows={6}
                  className="w-full resize-y rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-sm text-coco-brown placeholder:text-coco-brown-medium/30 focus:border-coco-golden focus:outline-none focus:ring-1 focus:ring-coco-golden/30"
                />
                <p className="text-right text-[10px] text-coco-brown-medium/40">
                  {brandVoice.length} characters
                  {!brandVoice.trim() && (
                    <span className="ml-2 text-amber-500">
                      (will use built-in default)
                    </span>
                  )}
                </p>
              </div>

              {/* Default Style Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-coco-brown">
                  Default Caption Style
                </label>
                <Select
                  value={defaultStyle}
                  onValueChange={(v) => setDefaultStyle(v as CaptionStyle)}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STYLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-coco-brown-medium/40">
                  Pre-selected when generating captions. Can be changed per generation.
                </p>
              </div>

              {/* Always-Include Hashtags */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-coco-brown">
                  Always Include Hashtags
                </label>
                <p className="text-[10px] text-coco-brown-medium/40">
                  These hashtags will always be appended to generated captions.
                </p>
                <div className="flex gap-2">
                  <Input
                    ref={alwaysRef}
                    value={alwaysInput}
                    onChange={(e) => setAlwaysInput(e.target.value)}
                    onKeyDown={(e) =>
                      handleKeyDown(
                        e,
                        alwaysInclude,
                        setAlwaysInclude,
                        alwaysInput,
                        setAlwaysInput
                      )
                    }
                    placeholder="Type a hashtag and press Enter…"
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      addTag(
                        alwaysInclude,
                        setAlwaysInclude,
                        alwaysInput,
                        setAlwaysInput
                      )
                    }
                    disabled={!alwaysInput.trim()}
                    className="h-9"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {alwaysInclude.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() =>
                          removeTag(alwaysInclude, setAlwaysInclude, tag)
                        }
                        className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-200"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                  {alwaysInclude.length === 0 && (
                    <span className="text-[10px] italic text-coco-brown-medium/30">
                      None — hashtags come from the selector only
                    </span>
                  )}
                </div>
              </div>

              {/* Never-Include Hashtags */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-coco-brown">
                  Never Include Hashtags (Blacklist)
                </label>
                <p className="text-[10px] text-coco-brown-medium/40">
                  These hashtags will be excluded from all generated captions.
                </p>
                <div className="flex gap-2">
                  <Input
                    ref={neverRef}
                    value={neverInput}
                    onChange={(e) => setNeverInput(e.target.value)}
                    onKeyDown={(e) =>
                      handleKeyDown(
                        e,
                        neverInclude,
                        setNeverInclude,
                        neverInput,
                        setNeverInput
                      )
                    }
                    placeholder="Type a hashtag and press Enter…"
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      addTag(
                        neverInclude,
                        setNeverInclude,
                        neverInput,
                        setNeverInput
                      )
                    }
                    disabled={!neverInput.trim()}
                    className="h-9"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {neverInclude.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 bg-red-50 px-2 py-0.5 text-xs text-red-700"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() =>
                          removeTag(neverInclude, setNeverInclude, tag)
                        }
                        className="ml-0.5 rounded-full p-0.5 hover:bg-red-200"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                  {neverInclude.length === 0 && (
                    <span className="text-[10px] italic text-coco-brown-medium/30">
                      None — no hashtags blacklisted
                    </span>
                  )}
                </div>
              </div>

              {/* Default CTA */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-coco-brown">
                  Default Call-to-Action
                </label>
                <Input
                  value={defaultCta}
                  onChange={(e) => setDefaultCta(e.target.value)}
                  placeholder="e.g., Shop now at cocolash.com"
                  className="text-sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  {CTA_EXAMPLES.map((cta) => (
                    <button
                      key={cta}
                      type="button"
                      onClick={() => setDefaultCta(cta)}
                      className="rounded-full bg-coco-beige/50 px-2.5 py-0.5 text-[10px] text-coco-brown-medium transition-colors hover:bg-coco-beige"
                    >
                      {cta}
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-2 bg-coco-golden text-white hover:bg-coco-golden-dark"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : saved ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Caption Settings
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
