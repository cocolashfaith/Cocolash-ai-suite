"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
} from "lucide-react";
import type { Platform, SocialAccount, CaptionVariation } from "@/lib/types";

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
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

export function PublishModal({
  open,
  onClose,
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

  const hashtags = caption.hashtags.map((h) => `#${h}`).join(" ");
  const fullText = hashtags
    ? `${caption.text}\n\n${hashtags}`
    : caption.text;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-coco-brown">
            {state.step === "success"
              ? "Published!"
              : scheduledTime
                ? "Schedule Post"
                : "Publish Post"}
          </DialogTitle>
        </DialogHeader>

        {state.step === "success" ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <p className="mt-3 text-sm font-medium text-coco-brown">
              {scheduledTime ? "Post scheduled!" : "Post published!"}
            </p>
            <p className="mt-1 text-xs text-coco-brown-medium">
              Post ID: {state.postId}
            </p>
            <Button
              onClick={onClose}
              className="mt-4 bg-coco-golden text-white hover:bg-coco-golden-dark"
            >
              Done
            </Button>
          </div>
        ) : state.step === "error" ? (
          <div className="flex flex-col items-center py-6 text-center">
            <XCircle className="h-12 w-12 text-red-500" />
            <p className="mt-3 text-sm font-medium text-red-700">
              {state.message}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setState({ step: "confirm" })}
              >
                Try Again
              </Button>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex gap-3 rounded-xl border border-coco-beige-dark bg-coco-beige/20 p-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={imageUrl}
                    alt="Post image"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 text-xs text-coco-brown">
                    {fullText}
                  </p>
                </div>
              </div>

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

              <PostingTimeRecommendation
                platform={platform}
                onSelectTime={setScheduledTime}
              />

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
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handlePublish}
                disabled={
                  !selectedAccountId ||
                  accounts.length === 0 ||
                  state.step === "publishing"
                }
                className="gap-1.5 bg-coco-golden text-white hover:bg-coco-golden-dark"
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
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
