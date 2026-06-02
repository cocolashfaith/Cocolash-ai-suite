import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import * as socialAccountsModule from "@/app/api/social-accounts/route";
import * as supabaseServer from "@/lib/supabase/server";
import * as blotatoClientModule from "@/lib/blotato/client";
import type { BlotatoAccount } from "@/lib/blotato/types";

/**
 * Test suite for GET /api/social-accounts
 * Wave 0 (RED): Verifies the accounts sync logic checks cache freshness,
 * calls Blotato getAccounts on cache miss, upserts all returned accounts with is_active:true,
 * and returns the fresh account set.
 *
 * These tests specify the contract for SOC-03:
 * - Cache freshness check: <24h returns cached data
 * - Cache miss (>24h) triggers sync and Blotato getAccounts call
 * - All returned accounts are upserted with is_active:true
 * - Response includes { accounts: [], cached: boolean }
 * - Error handling on Blotato client failure
 * - Four "Active" accounts reflect the real Blotato result
 * - No mutations to DB in cache-hit scenarios
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/blotato/client");

describe("GET /api/social-accounts (SOC-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Returns cached accounts when cache is fresh (<24h old)", async () => {
    // Arrange
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

    vi.setSystemTime(now);

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      blotato_account_id: "fb_1",
                      platform: "facebook",
                      account_name: "Faith McCoy Scriven",
                      account_handle: null,
                      is_active: true,
                      last_synced_at: twelveHoursAgo,
                    },
                    {
                      blotato_account_id: "ig_1",
                      platform: "instagram",
                      account_name: null,
                      account_handle: "cocolashclub_",
                      is_active: true,
                      last_synced_at: twelveHoursAgo,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return null;
      }),
    } as never);

    process.env.BLOTATO_API_KEY = "test_key";

    // Act
    const response = (await socialAccountsModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.cached).toBe(true);
    expect(data.accounts).toHaveLength(2);
    expect(data.accounts[0].is_active).toBe(true);

    expect(
      vi.mocked(blotatoClientModule.createBlotatoClient)
    ).not.toHaveBeenCalled();

    delete process.env.BLOTATO_API_KEY;
  });

  it("Triggers sync and calls getAccounts when cache is stale (>24h)", async () => {
    // Arrange
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));

    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      blotato_account_id: "fb_1",
                      platform: "facebook",
                      is_active: true,
                      last_synced_at: new Date("2026-05-07T12:00:00Z").toISOString(),
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            upsert: mockUpsert,
          };
        }
        return null;
      }),
    } as never);

    const mockClient = {
      getAccounts: vi.fn().mockResolvedValue([
        {
          id: "fb_1",
          platform: "facebook",
          fullname: "Faith McCoy Scriven",
          username: null,
        } as BlotatoAccount,
        {
          id: "ig_1",
          platform: "instagram",
          fullname: null,
          username: "cocolashclub_",
        } as BlotatoAccount,
      ]),
    };
    vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue(
      mockClient as never
    );

    process.env.BLOTATO_API_KEY = "test_key";

    // Act
    const response = (await socialAccountsModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.cached).toBe(false);
    expect(mockClient.getAccounts).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalled();

    delete process.env.BLOTATO_API_KEY;
  });

  it("Sync logic upserts all returned accounts from getAccounts with is_active:true", async () => {
    // Arrange
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));

    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            upsert: mockUpsert,
          };
        }
        return null;
      }),
    } as never);

    const mockAccounts = [
      {
        id: "acc_1",
        platform: "facebook" as const,
        fullname: "Account 1",
        username: "acc1",
      },
      {
        id: "acc_2",
        platform: "instagram" as const,
        fullname: "Account 2",
        username: "acc2",
      },
      {
        id: "acc_3",
        platform: "tiktok" as const,
        fullname: "Account 3",
        username: "acc3",
      },
    ] as BlotatoAccount[];

    const mockClient = {
      getAccounts: vi.fn().mockResolvedValue(mockAccounts),
    };
    vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue(
      mockClient as never
    );

    process.env.BLOTATO_API_KEY = "test_key";

    // Act
    await socialAccountsModule.GET();

    // Assert
    expect(mockUpsert).toHaveBeenCalled();
    const upsertPayload = mockUpsert.mock.calls[0][0];
    expect(upsertPayload).toHaveLength(3);
    expect(
      upsertPayload.every(
        (item: unknown) => (item as Record<string, unknown>).is_active === true
      )
    ).toBe(true);

    delete process.env.BLOTATO_API_KEY;
  });

  it("Sync returns the full fresh account set after upserting", async () => {
    // Arrange
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));

    const fourAccounts = [
      {
        blotato_account_id: "acc_1",
        platform: "facebook",
        account_name: "Account 1",
        is_active: true,
      },
      {
        blotato_account_id: "acc_2",
        platform: "instagram",
        account_name: "Account 2",
        is_active: true,
      },
    ];

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    } as never);

    const mockClient = {
      getAccounts: vi.fn().mockResolvedValue([
        {
          id: "acc_1",
          platform: "facebook" as const,
          fullname: "Account 1",
          username: "acc1",
        },
        {
          id: "acc_2",
          platform: "instagram" as const,
          fullname: "Account 2",
          username: "acc2",
        },
      ] as BlotatoAccount[]),
    };
    vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue(
      mockClient as never
    );

    // Mock the final select to return the fresh accounts
    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: fourAccounts,
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    } as never);

    process.env.BLOTATO_API_KEY = "test_key";

    // Act
    const response = (await socialAccountsModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.accounts).toHaveLength(2);
    expect(data.cached).toBe(false);

    delete process.env.BLOTATO_API_KEY;
  });

  it("Account state reflects is_active:true from the sync result", async () => {
    // Arrange
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    } as never);

    const mockClient = {
      getAccounts: vi.fn().mockResolvedValue([
        {
          id: "acc_1",
          platform: "facebook" as const,
          fullname: "Account 1",
          username: "acc1",
        },
      ] as BlotatoAccount[]),
    };
    vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue(
      mockClient as never
    );

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      blotato_account_id: "acc_1",
                      platform: "facebook",
                      account_name: "Account 1",
                      is_active: true,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    } as never);

    process.env.BLOTATO_API_KEY = "test_key";

    // Act
    const response = (await socialAccountsModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert
    expect(data.accounts[0].is_active).toBe(true);

    delete process.env.BLOTATO_API_KEY;
  });

  it("Does not mutate social_accounts table in tests (read-only verification)", async () => {
    // Arrange
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

    vi.setSystemTime(now);

    const selectMock = vi.fn();
    const upsertMock = vi.fn();

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        if (table === "social_accounts") {
          return {
            select: selectMock.mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      blotato_account_id: "fb_1",
                      platform: "facebook",
                      is_active: true,
                      last_synced_at: twelveHoursAgo,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            upsert: upsertMock,
          };
        }
        return null;
      }),
    } as never);

    process.env.BLOTATO_API_KEY = "test_key";

    // Act
    await socialAccountsModule.GET();

    // Assert: Cache hit, so upsert should not be called
    expect(upsertMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalled();

    delete process.env.BLOTATO_API_KEY;
  });

  it("Handles Blotato getAccounts error gracefully", async () => {
    // Arrange
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          };
        }
        return null;
      }),
    } as never);

    const mockClient = {
      getAccounts: vi
        .fn()
        .mockRejectedValue(new Error("Blotato API error")),
    };
    vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue(
      mockClient as never
    );

    process.env.BLOTATO_API_KEY = "test_key";

    // Act
    const response = (await socialAccountsModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();

    delete process.env.BLOTATO_API_KEY;
  });

  it("Four 'Active' accounts match the real Blotato result", async () => {
    // Arrange
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));

    const fourAccounts = [
      {
        blotato_account_id: "fb_1",
        platform: "facebook",
        account_name: "Faith McCoy Scriven",
        account_handle: null,
        is_active: true,
      },
      {
        blotato_account_id: "ig_1",
        platform: "instagram",
        account_name: null,
        account_handle: "cocolashclub_",
        is_active: true,
      },
      {
        blotato_account_id: "pin_1",
        platform: "pinterest",
        account_name: null,
        account_handle: "cocolash1",
        is_active: true,
      },
      {
        blotato_account_id: "yt_1",
        platform: "youtube",
        account_name: "Support CocoLash",
        account_handle: null,
        is_active: true,
      },
    ];

    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      ...fourAccounts[0],
                      last_synced_at: new Date("2026-05-07T12:00:00Z").toISOString(),
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    } as never);

    const mockClient = {
      getAccounts: vi.fn().mockResolvedValue([
        {
          id: "fb_1",
          platform: "facebook" as const,
          fullname: "Faith McCoy Scriven",
          username: null,
        },
        {
          id: "ig_1",
          platform: "instagram" as const,
          fullname: null,
          username: "cocolashclub_",
        },
        {
          id: "pin_1",
          platform: "pinterest" as const,
          fullname: null,
          username: "cocolash1",
        },
        {
          id: "yt_1",
          platform: "youtube" as const,
          fullname: "Support CocoLash",
          username: null,
        },
      ] as BlotatoAccount[]),
    };
    vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue(
      mockClient as never
    );

    // Mock the final select to return fresh data
    vi.mocked(supabaseServer.createClient).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === "social_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: fourAccounts,
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    } as never);

    process.env.BLOTATO_API_KEY = "test_key";

    // Act
    const response = (await socialAccountsModule.GET()) as NextResponse;
    const data = await response.json();

    // Assert: Response reflects fresh Blotato result, not stale DB
    expect(response.status).toBe(200);
    expect(data.accounts).toHaveLength(4);
    expect(data.cached).toBe(false);
    expect(
      data.accounts.every(
        (acc: Record<string, unknown>) => acc.is_active === true
      )
    ).toBe(true);

    const platforms = data.accounts.map(
      (acc: Record<string, unknown>) => acc.platform
    );
    expect(platforms).toContain("facebook");
    expect(platforms).toContain("instagram");
    expect(platforms).toContain("pinterest");
    expect(platforms).toContain("youtube");

    delete process.env.BLOTATO_API_KEY;
  });
});
