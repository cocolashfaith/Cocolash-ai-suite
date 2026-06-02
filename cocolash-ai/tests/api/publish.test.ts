import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import * as publishModule from "@/app/api/publish/route";
import * as supabaseServer from "@/lib/supabase/server";
import * as blotatoClientModule from "@/lib/blotato/client";
import { BlotatoError } from "@/lib/blotato/types";

/**
 * Test suite for POST /api/publish
 * Wave 0 (RED): Verifies the publish flow orchestrates caption fetch, image fetch,
 * API key resolution, media upload, post publishing/scheduling, and audit trail insertion.
 *
 * These tests specify the contract for SOC-02:
 * - Caption and image are fetched from DB
 * - API key is resolved from DB first, then env fallback
 * - Blotato client is created with resolved key
 * - Media is uploaded before publishing
 * - publishPost is called for immediate publish, schedulePost for future scheduling
 * - Audit row is inserted into scheduled_posts
 * - Response includes { success, postId, status }
 * - BlotatoError is caught and re-thrown with status code
 * - Request validation for required fields and platform
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/blotato/client");

describe("POST /api/publish (SOC-02)", () => {
  let mockSupabase: unknown;
  let mockClient: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock for Blotato client
    mockClient = {
      uploadMedia: vi
        .fn()
        .mockResolvedValue({ url: "https://cdn.blotato.com/test.jpg" }),
      publishPost: vi
        .fn()
        .mockResolvedValue({ postId: "post_123", status: "published" }),
      schedulePost: vi
        .fn()
        .mockResolvedValue({ postId: "post_456", status: "scheduled" }),
    };
    vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue(
      mockClient as never
    );

    // Setup default mock for Supabase
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    };
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      mockSupabase as never
    );
  });

  it("POST /api/publish resolves caption and image from DB", async () => {
    // Arrange
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "captions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "caption_1",
                    caption_text: "Check these lashes!",
                    hashtags: ["lashes", "beauty"],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "generated_images") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "image_1",
                    image_url: "s3://bucket/image.jpg",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
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
        if (table === "scheduled_posts") {
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return null;
      }),
    };
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      mockSupabase as never
    );

    process.env.BLOTATO_API_KEY = "test_key";
    const request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });

    // Act
    const response = (await publishModule.POST(request)) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.postId).toBeDefined();

    delete process.env.BLOTATO_API_KEY;
  });

  it("Resolves API key from DB first, then falls back to env", async () => {
    // Arrange
    process.env.BLOTATO_API_KEY = "env_key_fallback";
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "caption_settings") {
          return {
            select: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ blotato_api_key: "db_key_xyz" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "captions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "caption_1",
                    caption_text: "Test caption",
                    hashtags: [],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "generated_images") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "image_1", image_url: "s3://test.jpg" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "scheduled_posts") {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    };
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      mockSupabase as never
    );

    const request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });

    // Act
    await publishModule.POST(request);

    // Assert: createBlotatoClient was called with DB key
    expect(vi.mocked(blotatoClientModule.createBlotatoClient)).toHaveBeenCalledWith(
      "db_key_xyz"
    );

    delete process.env.BLOTATO_API_KEY;
  });

  it("Calls uploadMedia then publishPost in correct order", async () => {
    // Arrange
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "captions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "caption_1",
                    caption_text: "Beautiful lashes",
                    hashtags: ["lashes"],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "generated_images") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "image_1", image_url: "s3://image.jpg" },
                  error: null,
                }),
              }),
            }),
          };
        }
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
        if (table === "scheduled_posts") {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    };
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      mockSupabase as never
    );

    process.env.BLOTATO_API_KEY = "test_key";
    const request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });

    // Act
    await publishModule.POST(request);

    // Assert: uploadMedia was called first, then publishPost
    expect(mockClient).toBeDefined();
    const mockClientTyped = mockClient as Record<string, unknown>;
    const uploadFn = mockClientTyped.uploadMedia as any;
    const publishFn = mockClientTyped.publishPost as any;

    expect(uploadFn).toHaveBeenCalledWith("s3://image.jpg");
    expect(publishFn).toHaveBeenCalled();

    const publishCall = publishFn.mock.calls[0][0];
    expect(publishCall.mediaUrls).toContain("https://cdn.blotato.com/test.jpg");
    expect(publishCall.text).toContain("Beautiful lashes");

    delete process.env.BLOTATO_API_KEY;
  });

  it("Inserts audit row into scheduled_posts on success", async () => {
    // Arrange
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "captions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "caption_1",
                    caption_text: "Test",
                    hashtags: [],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "generated_images") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "image_1", image_url: "s3://test.jpg" },
                  error: null,
                }),
              }),
            }),
          };
        }
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
        if (table === "scheduled_posts") {
          return { insert: insertMock };
        }
        return null;
      }),
    };
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      mockSupabase as never
    );

    process.env.BLOTATO_API_KEY = "test_key";
    const request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });

    // Act
    await publishModule.POST(request);

    // Assert
    expect(insertMock).toHaveBeenCalled();
    const insertCall = insertMock.mock.calls[0][0];
    expect(insertCall.image_id).toBe("image_1");
    expect(insertCall.caption_id).toBe("caption_1");
    expect(insertCall.blotato_post_id).toBe("post_123");
    expect(insertCall.blotato_account_id).toBe("acc_123");
    expect(insertCall.status).toBe("published");

    delete process.env.BLOTATO_API_KEY;
  });

  it("Handles immediate publish vs. scheduledTime branching", async () => {
    // Arrange
    const now = new Date();
    const futureTime = new Date(now.getTime() + 3600000).toISOString();

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "captions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "caption_1",
                    caption_text: "Test",
                    hashtags: [],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "generated_images") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "image_1", image_url: "s3://test.jpg" },
                  error: null,
                }),
              }),
            }),
          };
        }
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
        if (table === "scheduled_posts") {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    };
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      mockSupabase as never
    );

    process.env.BLOTATO_API_KEY = "test_key";

    // Test immediate publish (no scheduledTime)
    let request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });
    await publishModule.POST(request);
    const mockClientTyped = mockClient as Record<string, any>;
    expect(mockClientTyped.publishPost).toHaveBeenCalled();

    mockClientTyped.publishPost.mockClear();
    mockClientTyped.schedulePost.mockClear();

    // Test scheduled publish
    request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
        scheduledTime: futureTime,
      }),
    });
    const response = (await publishModule.POST(request)) as NextResponse;
    const data = await response.json();

    expect(mockClientTyped.schedulePost).toHaveBeenCalled();
    expect(data.status).toBe("scheduled");

    delete process.env.BLOTATO_API_KEY;
  });

  it("Returns { success: true, postId, status } on successful publish", async () => {
    // Arrange
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "captions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "caption_1", caption_text: "Test", hashtags: [] },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "generated_images") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "image_1", image_url: "s3://test.jpg" },
                  error: null,
                }),
              }),
            }),
          };
        }
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
        if (table === "scheduled_posts") {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return null;
      }),
    };
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      mockSupabase as never
    );

    process.env.BLOTATO_API_KEY = "test_key";
    const request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });

    // Act
    const response = (await publishModule.POST(request)) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.postId).toBe("post_123");
    expect(data.status).toBe("published");

    delete process.env.BLOTATO_API_KEY;
  });

  it("Catches BlotatoError and re-throws with status code", async () => {
    // Arrange
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "captions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "caption_1", caption_text: "Test", hashtags: [] },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "generated_images") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "image_1", image_url: "s3://test.jpg" },
                  error: null,
                }),
              }),
            }),
          };
        }
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
        return null;
      }),
    };
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      mockSupabase as never
    );

    const blotatoError = new BlotatoError(403, {
      message: "Invalid account ID",
    });
    const errorClient = {
      uploadMedia: vi.fn().mockRejectedValue(blotatoError),
      publishPost: vi.fn(),
    };
    vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue(
      errorClient as never
    );

    process.env.BLOTATO_API_KEY = "test_key";
    const request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });

    // Act
    const response = (await publishModule.POST(request)) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(data.blotato_status).toBe(403);
    expect(data.error).toContain("Invalid account ID");

    delete process.env.BLOTATO_API_KEY;
  });

  it("Validates required fields: captionId, imageId, accountId, platform", async () => {
    // Test missing captionId
    let request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        imageId: "image_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });

    let response = (await publishModule.POST(request)) as NextResponse;
    expect(response.status).toBe(400);

    // Test missing imageId
    request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        accountId: "acc_123",
        platform: "instagram",
      }),
    });
    response = (await publishModule.POST(request)) as NextResponse;
    expect(response.status).toBe(400);

    // Test missing accountId
    request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        platform: "instagram",
      }),
    });
    response = (await publishModule.POST(request)) as NextResponse;
    expect(response.status).toBe(400);

    // Test missing platform
    request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
      }),
    });
    response = (await publishModule.POST(request)) as NextResponse;
    expect(response.status).toBe(400);
  });

  it("Validates platform against VALID_PLATFORMS", async () => {
    // Arrange - invalid platform
    const request = new NextRequest("http://localhost:3000/api/publish", {
      method: "POST",
      body: JSON.stringify({
        captionId: "caption_1",
        imageId: "image_1",
        accountId: "acc_123",
        platform: "unknown_platform",
      }),
    });

    // Act
    const response = (await publishModule.POST(request)) as NextResponse;
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toContain("platform must be one of");
  });
});
