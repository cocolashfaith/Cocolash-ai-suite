import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import * as supabaseServer from "@/lib/supabase/server";
import * as blotatoClientModule from "@/lib/blotato/client";
import { GET } from "@/app/api/publish/status/route";

/**
 * GET /api/publish/status proxies Blotato's async post-status lookup so the UI
 * can poll for the live post URL after an immediate publish.
 */

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/blotato/client");

function req(submissionId?: string): NextRequest {
  const url = submissionId
    ? `http://localhost/api/publish/status?submissionId=${submissionId}`
    : "http://localhost/api/publish/status";
  return new NextRequest(url);
}

function mockSupabaseWithDbKey(key: string | null): void {
  vi.mocked(supabaseServer.createClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: key ? [{ blotato_api_key: key }] : [],
          error: null,
        }),
      }),
    }),
  } as never);
}

function mockGetPost(result: unknown): void {
  vi.mocked(blotatoClientModule.createBlotatoClient).mockReturnValue({
    getPost: vi.fn().mockResolvedValue(result),
  } as never);
}

describe("GET /api/publish/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOTATO_API_KEY = "env_key";
  });
  afterEach(() => {
    delete process.env.BLOTATO_API_KEY;
  });

  it("returns the publicUrl when the post is published", async () => {
    mockSupabaseWithDbKey(null);
    mockGetPost({
      status: "published",
      publicUrl: "https://instagram.com/p/ABC123",
    });

    const res = await GET(req("sub_1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("published");
    expect(data.publicUrl).toBe("https://instagram.com/p/ABC123");
    expect(data.errorMessage).toBeNull();
  });

  it("returns in-progress with a null url while still publishing", async () => {
    mockSupabaseWithDbKey(null);
    mockGetPost({ status: "in-progress" });

    const res = await GET(req("sub_2"));
    const data = await res.json();
    expect(data.status).toBe("in-progress");
    expect(data.publicUrl).toBeNull();
  });

  it("surfaces the error message on failure", async () => {
    mockSupabaseWithDbKey(null);
    mockGetPost({ status: "failed", errorMessage: "Instagram rejected the post" });

    const res = await GET(req("sub_3"));
    const data = await res.json();
    expect(data.status).toBe("failed");
    expect(data.errorMessage).toBe("Instagram rejected the post");
  });

  it("400s when submissionId is missing", async () => {
    mockSupabaseWithDbKey(null);
    const res = await GET(req());
    expect(res.status).toBe(400);
  });
});
