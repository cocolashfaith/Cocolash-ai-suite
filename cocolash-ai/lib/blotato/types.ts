// ── Blotato API Types ─────────────────────────────────────────

export type BlotatoPlatform =
  | "twitter"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "pinterest"
  | "tiktok"
  | "threads"
  | "bluesky"
  | "youtube"
  | "other";

export interface BlotatoAccount {
  id: string;
  platform: BlotatoPlatform;
  fullname: string;
  username: string;
}

export interface BlotatoSubAccount {
  id: string;
  accountId: string;
  name: string;
}

export interface BlotatoPostContent {
  text: string;
  mediaUrls: string[];
  platform: BlotatoPlatform;
  additionalPosts?: { text: string; mediaUrls: string[] }[];
}

export interface BlotatoPostTarget {
  targetType: BlotatoPlatform;
  pageId?: string;
}

export interface BlotatoPostPayload {
  post: {
    accountId: string;
    content: BlotatoPostContent;
    target: BlotatoPostTarget;
  };
  scheduledTime?: string;
}

export interface BlotatoPublishResult {
  postId: string;
  status: string;
}

export interface BlotatoMediaUploadResult {
  url: string;
  id?: string;
}

export interface PublishParams {
  accountId: string;
  platform: BlotatoPlatform;
  text: string;
  mediaUrls: string[];
  pageId?: string;
}

export interface ScheduleParams extends PublishParams {
  scheduledTime: Date;
}

export class BlotatoError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: string }).message)
        : `Blotato API error (${status})`;
    super(msg);
    this.name = "BlotatoError";
    this.status = status;
    this.body = body;
  }
}
