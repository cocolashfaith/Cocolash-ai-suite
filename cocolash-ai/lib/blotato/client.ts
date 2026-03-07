import {
  BlotatoError,
  type BlotatoAccount,
  type BlotatoSubAccount,
  type BlotatoPublishResult,
  type BlotatoMediaUploadResult,
  type BlotatoPlatform,
  type PublishParams,
  type ScheduleParams,
} from "./types";

const BASE_URL = "https://backend.blotato.com/v2";

export class BlotatoClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retries = 1
  ): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "blotato-api-key": this.apiKey,
          ...options.headers,
        },
      });

      if (!response.ok) {
        if (retries > 0 && response.status === 429) {
          await new Promise((r) => setTimeout(r, 2000));
          return this.request<T>(endpoint, options, retries - 1);
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }

        throw new BlotatoError(response.status, body);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BlotatoError) throw error;
      throw new BlotatoError(0, { message: `Network error: ${error}` });
    }
  }

  async getAccounts(
    platform?: BlotatoPlatform
  ): Promise<BlotatoAccount[]> {
    const query = platform ? `?platform=${platform}` : "";
    const result = await this.request<{
      items: BlotatoAccount[][] | BlotatoAccount[];
    }>(`/users/me/accounts${query}`);

    const items = result.items ?? [];

    return items.flat().filter(
      (a): a is BlotatoAccount =>
        typeof a === "object" && a !== null && "id" in a && "platform" in a
    );
  }

  async getSubAccounts(accountId: string): Promise<BlotatoSubAccount[]> {
    const result = await this.request<{
      items: BlotatoSubAccount[];
    }>(`/users/me/accounts/${accountId}/subaccounts`);

    return result.items ?? [];
  }

  async uploadMedia(sourceUrl: string): Promise<BlotatoMediaUploadResult> {
    return this.request<BlotatoMediaUploadResult>("/media", {
      method: "POST",
      body: JSON.stringify({ url: sourceUrl }),
    });
  }

  async publishPost(params: PublishParams): Promise<BlotatoPublishResult> {
    return this.request<BlotatoPublishResult>("/posts", {
      method: "POST",
      body: JSON.stringify({
        post: {
          accountId: params.accountId,
          content: {
            text: params.text,
            mediaUrls: params.mediaUrls,
            platform: params.platform,
          },
          target: {
            targetType: params.platform,
            ...(params.pageId ? { pageId: params.pageId } : {}),
          },
        },
      }),
    });
  }

  async schedulePost(params: ScheduleParams): Promise<BlotatoPublishResult> {
    return this.request<BlotatoPublishResult>("/posts", {
      method: "POST",
      body: JSON.stringify({
        post: {
          accountId: params.accountId,
          content: {
            text: params.text,
            mediaUrls: params.mediaUrls,
            platform: params.platform,
          },
          target: {
            targetType: params.platform,
            ...(params.pageId ? { pageId: params.pageId } : {}),
          },
        },
        scheduledTime: params.scheduledTime.toISOString(),
      }),
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getAccounts();
      return true;
    } catch {
      return false;
    }
  }
}

export function createBlotatoClient(apiKey?: string): BlotatoClient {
  const key = apiKey || process.env.BLOTATO_API_KEY;
  if (!key) {
    throw new Error("Blotato API key not configured");
  }
  return new BlotatoClient(key);
}
