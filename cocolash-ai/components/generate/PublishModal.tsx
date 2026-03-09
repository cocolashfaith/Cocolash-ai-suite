"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchedulePicker } from "./SchedulePicker";
import { PostingTimeRecommendation } from "./PostingTimeRecommendation";
import {
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  Calendar,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  MoreHorizontal,
  Instagram,
  ArrowLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Platform, SocialAccount, CaptionVariation } from "@/lib/types";

interface PublishModalProps {
  open: boolean;
  onBack: () => void;
  onCloseAll: () => void;
  imageUrl: string;
  imageId: string;
  captionId: string;
  caption: CaptionVariation;
  platform: Platform;
}

type PublishState =
  | { step: "confirm" }
  | { step: "publishing" }
  | { step: "success"; postId: string }
  | { step: "error"; message: string };

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "from-purple-600 via-pink-500 to-orange-400",
  tiktok: "from-gray-900 to-gray-800",
  twitter: "from-gray-800 to-gray-700",
  facebook: "from-blue-600 to-blue-700",
  linkedin: "from-blue-700 to-blue-800",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

function PlatformPreview({
  platform,
  imageUrl,
  captionText,
  hashtags,
  accountName,
  accountHandle,
}: {
  platform: Platform;
  imageUrl: string;
  captionText: string;
  hashtags: string[];
  accountName: string;
  accountHandle: string;
}) {
  const hashtagStr = hashtags.map((h) => `#${h}`).join(" ");

  if (platform === "instagram") {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* IG Header */}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
            <span className="text-[10px] font-bold text-white">
              {(accountName || "C")[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-900">
              {accountHandle || "@thecocolash.co"}
            </p>
          </div>
          <MoreHorizontal className="h-4 w-4 text-gray-500" />
        </div>

        {/* IG Image — 4:5 (Instagram's native post ratio) */}
        <div className="relative aspect-[4/5] w-full min-w-0 bg-gray-100">
          <Image src={imageUrl} alt="Post preview" fill className="object-cover object-center" sizes="(max-width: 500px) 100vw, 500px" />
        </div>

        {/* IG Actions */}
        <div className="flex items-center gap-4 px-3 py-2.5">
          <Heart className="h-5 w-5 text-gray-800" />
          <MessageCircle className="h-5 w-5 text-gray-800" />
          <Share2 className="h-5 w-5 text-gray-800" />
          <div className="flex-1" />
          <Bookmark className="h-5 w-5 text-gray-800" />
        </div>

        {/* IG Caption */}
        <div className="px-3 pb-3">
          <p className="text-xs leading-relaxed text-gray-900">
            <span className="font-semibold">{accountHandle || "thecocolash.co"}</span>{" "}
            <span className="whitespace-pre-wrap">
              {captionText.length > 120 ? captionText.slice(0, 120) + "…" : captionText}
            </span>
          </p>
          {hashtags.length > 0 && (
            <p className="mt-1 text-[10px] leading-relaxed text-blue-800/70">
              {hashtagStr.length > 100 ? hashtagStr.slice(0, 100) + "…" : hashtagStr}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (platform === "tiktok") {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-black shadow-sm">
        <div className="relative aspect-[9/14] w-full">
          <Image src={imageUrl} alt="Post preview" fill className="object-cover opacity-90" />
          {/* TikTok overlay UI */}
          <div className="absolute inset-0 flex flex-col justify-end p-3">
            {/* Right-side icons */}
            <div className="absolute right-2 bottom-12 flex flex-col items-center gap-3">
              <div className="flex flex-col items-center">
                <Heart className="h-5 w-5 text-white drop-shadow" />
                <span className="text-[8px] font-medium text-white drop-shadow">0</span>
              </div>
              <div className="flex flex-col items-center">
                <MessageCircle className="h-5 w-5 text-white drop-shadow" />
                <span className="text-[8px] font-medium text-white drop-shadow">0</span>
              </div>
              <div className="flex flex-col items-center">
                <Bookmark className="h-5 w-5 text-white drop-shadow" />
                <span className="text-[8px] font-medium text-white drop-shadow">0</span>
              </div>
              <div className="flex flex-col items-center">
                <Share2 className="h-5 w-5 text-white drop-shadow" />
                <span className="text-[8px] font-medium text-white drop-shadow">0</span>
              </div>
            </div>
            {/* Caption */}
            <div>
              <p className="text-[10px] font-semibold text-white drop-shadow">
                @{accountHandle || "thecocolash.co"}
              </p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-white/90 drop-shadow">
                {captionText.length > 80 ? captionText.slice(0, 80) + "…" : captionText}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (platform === "twitter") {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex gap-2.5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-800">
            <span className="text-[10px] font-bold text-white">
              {(accountName || "C")[0].toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-900">{accountName || "CocoLash"}</span>
              <span className="text-xs text-gray-500">{accountHandle || "@thecocolash"}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-900">
              {captionText.length > 280 ? captionText.slice(0, 277) + "…" : captionText}
            </p>
            <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl border border-gray-200">
              <Image src={imageUrl} alt="Post preview" fill className="object-cover" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (platform === "facebook") {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600">
            <span className="text-[10px] font-bold text-white">
              {(accountName || "C")[0].toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-900">{accountName || "CocoLash"}</p>
            <p className="text-[10px] text-gray-500">Just now · 🌐</p>
          </div>
        </div>
        <div className="px-3 pb-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-900">
            {captionText.length > 150 ? captionText.slice(0, 150) + "…" : captionText}
          </p>
        </div>
        <div className="relative aspect-[4/5] w-full min-w-0">
          <Image src={imageUrl} alt="Post preview" fill className="object-cover object-center" />
        </div>
        <div className="flex items-center justify-around border-t border-gray-200 py-2 text-xs text-gray-500">
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>↗ Share</span>
        </div>
      </div>
    );
  }

  // LinkedIn (default)
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-700">
          <span className="text-[10px] font-bold text-white">
            {(accountName || "C")[0].toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-900">{accountName || "CocoLash"}</p>
          <p className="text-[10px] text-gray-500">Just now · 🌐</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-900">
          {captionText.length > 200 ? captionText.slice(0, 200) + "…" : captionText}
        </p>
      </div>
      <div className="relative aspect-[1.91/1] w-full min-w-0">
        <Image src={imageUrl} alt="Post preview" fill className="object-cover object-center" />
      </div>
    </div>
  );
}

export function PublishModal({
  open,
  onBack,
  onCloseAll,
  imageUrl,
  imageId,
  captionId,
  caption,
  platform,
}: PublishModalProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
  const [state, setState] = useState<PublishState>({ step: "confirm" });
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    if (!open) return;
    setState({ step: "confirm" });
    setScheduledTime(null);

    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const res = await fetch("/api/social-accounts");
        const data = await res.json();
        const filtered = (data.accounts ?? []).filter(
          (a: SocialAccount) => a.platform === platform && a.is_active
        );
        setAccounts(filtered);
        if (filtered.length > 0 && !selectedAccountId) {
          setSelectedAccountId(filtered[0].blotato_account_id);
        }
      } catch {
        setAccounts([]);
      } finally {
        setLoadingAccounts(false);
      }
    };

    fetchAccounts();
  }, [open, platform, selectedAccountId]);

  const handlePublish = async () => {
    if (!selectedAccountId) return;

    setState({ step: "publishing" });

    try {
      const body: Record<string, unknown> = {
        captionId,
        imageId,
        accountId: selectedAccountId,
        platform,
      };

      if (scheduledTime) {
        body.scheduledTime = scheduledTime.toISOString();
      }

      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ step: "error", message: data.error || "Publishing failed" });
        return;
      }

      setState({ step: "success", postId: data.postId });
    } catch {
      setState({ step: "error", message: "Network error. Please try again." });
    }
  };

  const selectedAccount = accounts.find(
    (a) => a.blotato_account_id === selectedAccountId
  );
  const accountName = selectedAccount?.account_name || "CocoLash";
  const accountHandle = selectedAccount?.account_handle || "";

  const hashtags = caption.hashtags.map((h) => `#${h}`).join(" ");
  const fullText = hashtags ? `${caption.text}\n\n${hashtags}` : caption.text;

  const gradientClass = PLATFORM_COLORS[platform] || PLATFORM_COLORS.instagram;
  const platformLabel = PLATFORM_LABELS[platform] || platform;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCloseAll()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden rounded-2xl p-0 sm:max-w-none"
      >
        {/* Header with platform gradient accent */}
        <div className={cn("flex items-center justify-between bg-gradient-to-r px-6 py-4", gradientClass)}>
          <DialogHeader className="flex-1">
            <DialogTitle className="flex items-center gap-2 text-white">
              {platform === "instagram" && <Instagram className="h-5 w-5" />}
              {state.step === "success"
                ? `Published to ${platformLabel}!`
                : scheduledTime
                  ? `Schedule to ${platformLabel}`
                  : `Publish to ${platformLabel}`}
            </DialogTitle>
          </DialogHeader>
          <button
            onClick={onCloseAll}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {state.step === "success" ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="mt-4 text-base font-semibold text-coco-brown">
              {scheduledTime ? "Post scheduled successfully!" : "Post published successfully!"}
            </p>
            <p className="mt-1 text-xs text-coco-brown-medium">
              Post ID: {state.postId}
            </p>
            <Button
              onClick={onCloseAll}
              className="mt-6 bg-coco-golden px-8 text-white hover:bg-coco-golden-dark"
            >
              Done
            </Button>
          </div>
        ) : state.step === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <p className="mt-4 text-sm font-medium text-red-700">
              {state.message}
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setState({ step: "confirm" })}
              >
                Try Again
              </Button>
              <Button variant="outline" onClick={onCloseAll}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto grid w-full max-w-5xl flex-1 gap-8 p-8 md:grid-cols-[1.2fr_1fr]">
              {/* Left: Visual preview */}
              <div className="min-w-0 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={cn("h-2 w-2 rounded-full bg-gradient-to-r", gradientClass)} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-coco-brown-medium/60">
                    Post Preview
                  </h3>
                </div>

                <div className="min-w-0 rounded-2xl bg-gray-50 p-3">
                  <PlatformPreview
                    platform={platform}
                    imageUrl={imageUrl}
                    captionText={caption.text}
                    hashtags={caption.hashtags}
                    accountName={accountName}
                    accountHandle={accountHandle.startsWith("@") ? accountHandle.slice(1) : accountHandle}
                  />
                </div>

                <p className="text-center text-[10px] text-coco-brown-medium/40">
                  This is an approximate preview of how your post will appear
                </p>
              </div>

              {/* Right: Publish controls */}
              <div className="space-y-4">
                {/* Caption preview text */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-coco-brown-medium/60">
                    Caption
                  </h3>
                  <div className="max-h-32 overflow-y-auto rounded-xl border border-coco-beige-dark bg-coco-beige/20 p-3">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-coco-brown">
                      {fullText.length > 300 ? fullText.slice(0, 300) + "…" : fullText}
                    </p>
                  </div>
                </div>

                {/* Account selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-coco-brown">
                    Account
                  </label>
                  {loadingAccounts ? (
                    <div className="flex items-center gap-2 text-xs text-coco-brown-medium">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading accounts…
                    </div>
                  ) : accounts.length > 0 ? (
                    <Select
                      value={selectedAccountId}
                      onValueChange={setSelectedAccountId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem
                            key={a.blotato_account_id}
                            value={a.blotato_account_id}
                          >
                            {a.account_name || a.account_handle || a.platform}
                            {a.account_handle && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {a.account_handle.startsWith("@")
                                  ? a.account_handle
                                  : `@${a.account_handle}`}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      No {platform} accounts connected. Add them in Settings →
                      Social Publishing.
                    </p>
                  )}
                </div>

                {/* Recommended time */}
                <PostingTimeRecommendation
                  platform={platform}
                  onSelectTime={setScheduledTime}
                />

                {/* Schedule picker */}
                <SchedulePicker
                  value={scheduledTime}
                  onChange={setScheduledTime}
                  onQuickNow={() => setScheduledTime(null)}
                />

                {scheduledTime && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-coco-golden/30 text-coco-golden-dark"
                  >
                    <Calendar className="h-3 w-3" />
                    Scheduled:{" "}
                    {scheduledTime.toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Badge>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={onBack}
                    className="gap-1.5"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onCloseAll}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handlePublish}
                    disabled={
                      !selectedAccountId ||
                      accounts.length === 0 ||
                      state.step === "publishing"
                    }
                    className="flex-1 gap-1.5 bg-coco-golden text-white hover:bg-coco-golden-dark"
                  >
                    {state.step === "publishing" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {scheduledTime ? "Scheduling…" : "Publishing…"}
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        {scheduledTime ? "Schedule" : "Publish Now"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
