"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Send,
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Music2,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
} from "lucide-react";
import type { ScheduledPost, Platform, PostStatus } from "@/lib/types";

const PLATFORM_META: Record<
  Platform,
  { label: string; icon: React.ElementType; color: string }
> = {
  instagram: { label: "Instagram", icon: Instagram, color: "text-purple-600" },
  tiktok: { label: "TikTok", icon: Music2, color: "text-gray-900" },
  twitter: { label: "X / Twitter", icon: Twitter, color: "text-blue-500" },
  facebook: { label: "Facebook", icon: Facebook, color: "text-blue-700" },
  linkedin: { label: "LinkedIn", icon: Linkedin, color: "text-blue-600" },
};

const STATUS_CONFIG: Record<
  PostStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  draft: {
    label: "Draft",
    icon: FileText,
    className: "bg-gray-100 text-gray-600",
  },
  scheduled: {
    label: "Scheduled",
    icon: Clock,
    className: "bg-blue-50 text-blue-600",
  },
  published: {
    label: "Published",
    icon: CheckCircle,
    className: "bg-emerald-50 text-emerald-600",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    className: "bg-red-50 text-red-600",
  },
};

interface PublishingHistoryViewProps {
  imageId: string;
}

export function PublishingHistoryView({
  imageId,
}: PublishingHistoryViewProps) {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/images/${imageId}/posts`);
        const data = await res.json();
        setPosts(data.posts ?? []);
      } catch {
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [imageId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <Send className="h-8 w-8 text-coco-brown-medium/20" />
        <p className="mt-2 text-sm text-coco-brown-medium/50">
          This image hasn&apos;t been published yet.
        </p>
        <p className="mt-1 text-xs text-coco-brown-medium/30">
          Generate captions and publish from the Generate page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {posts.map((post) => {
        const platformMeta = PLATFORM_META[post.platform];
        const statusConfig = STATUS_CONFIG[post.status];
        const PlatformIcon = platformMeta?.icon || Send;
        const StatusIcon = statusConfig.icon;

        const timeStr = post.published_time
          ? new Date(post.published_time).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : post.scheduled_time
            ? new Date(post.scheduled_time).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : new Date(post.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });

        return (
          <div
            key={post.id}
            className="flex items-center gap-3 rounded-lg border border-coco-beige-dark bg-white p-3"
          >
            <PlatformIcon
              className={`h-5 w-5 shrink-0 ${platformMeta?.color || "text-coco-brown-medium"}`}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-coco-brown">
                  {platformMeta?.label || post.platform}
                </span>
                <Badge
                  className={`gap-0.5 text-[9px] ${statusConfig.className}`}
                >
                  <StatusIcon className="h-2.5 w-2.5" />
                  {statusConfig.label}
                </Badge>
              </div>

              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-coco-brown-medium/40">
                <span>{timeStr}</span>
                {post.blotato_post_id && (
                  <span>ID: {post.blotato_post_id}</span>
                )}
              </div>

              {post.status === "failed" && post.error_message && (
                <p className="mt-1 text-[10px] text-red-500">
                  {post.error_message}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
